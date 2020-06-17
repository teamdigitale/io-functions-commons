/**
 * Implements a Nodemailer MailUp transport.
 *
 * Uses the MailUp REST API to send transactional emails:
 * see http://help.mailup.com/display/mailupapi/Transactional+Emails+using+APIs
 *
 */
import { isLeft, isRight } from "fp-ts/lib/Either";
import {
  fromEither,
  fromPredicate,
  TaskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { EmailString, NonEmptyString } from "italia-ts-commons/lib/strings";
import nodeFetch from "node-fetch";

import * as nodemailer from "nodemailer";

// tslint:disable-next-line:no-submodule-imports
import { Address as NodemailerAddress } from "nodemailer/lib/addressparser";

import * as winston from "winston";

import { fromNullable, Option } from "fp-ts/lib/Option";
import { readableReport } from "italia-ts-commons/lib/reporters";

export const SEND_TRANSACTIONAL_MAIL_ENDPOINT =
  "https://send.mailup.com/API/v2.0/messages/sendmessage";

const TRANSPORT_NAME = "MailUp";
const TRANSPORT_VERSION = "0.1";

/**
 * You need to create a SMTP+ user in MailUp administration panel
 * see also http://help.mailup.com/display/MUG/SMTP+Settings
 */
export const SmtpAuthInfo = t.interface({
  Secret: NonEmptyString,
  Username: NonEmptyString
});

export type SmtpAuthInfo = t.TypeOf<typeof SmtpAuthInfo>;

/**
 * MailUp API calls common response fields
 */
const ApiResponse = t.interface({
  Code: t.string,
  Message: t.string,
  Status: t.string
});

type ApiResponse = t.TypeOf<typeof ApiResponse>;

const Address = t.interface({
  Email: EmailString,
  Name: t.string
});

type Address = t.TypeOf<typeof Address>;

const NameValue = t.interface({
  N: NonEmptyString,
  V: t.string
});

type NameValue = t.TypeOf<typeof NameValue>;

const Html = t.interface({
  Body: NonEmptyString
});

type Html = t.TypeOf<typeof NameValue>;

const EmailPayload = t.intersection([
  t.interface({
    ExtendedHeaders: t.array(NameValue),
    From: Address,
    Html,
    Subject: NonEmptyString,
    Text: NonEmptyString,
    To: t.array(Address)
  }),
  t.partial({
    Bcc: t.array(Address),
    Cc: t.array(Address),
    ReplyTo: t.string
  })
]);

type EmailPayload = t.TypeOf<typeof EmailPayload>;

export interface IMailUpTransportOptions {
  readonly creds: SmtpAuthInfo;
  readonly fetchAgent?: typeof fetch;
}

interface IAddresses {
  readonly bcc?: ReadonlyArray<NodemailerAddress>;
  readonly cc?: ReadonlyArray<NodemailerAddress>;
  readonly from?: ReadonlyArray<NodemailerAddress>;
  readonly sender?: ReadonlyArray<NodemailerAddress>;
  readonly "reply-to"?: ReadonlyArray<NodemailerAddress>;
  readonly to?: ReadonlyArray<NodemailerAddress>;
}

function sendTransactionalMail(
  creds: SmtpAuthInfo,
  payload: EmailPayload,
  fetchAgent: typeof fetch
): TaskEither<Error, ApiResponse> {
  return tryCatch(
    () =>
      fetchAgent(SEND_TRANSACTIONAL_MAIL_ENDPOINT, {
        body: JSON.stringify({ ...payload, User: creds }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      }),
    err => new Error(`Error posting to MailUp: ${err}`)
  )
    .chain(
      fromPredicate<Error, Response>(
        r => r.ok,
        r => new Error(`Error returned from MailUp API: ${r.status}`)
      )
    )
    .chain(response =>
      tryCatch(
        () => response.json(),
        err => new Error(`Error getting MailUp API payload: ${err}`)
      )
    )
    .chain(json =>
      fromEither(
        ApiResponse.decode(json).mapLeft(
          errors =>
            new Error(
              `Error while decoding response from MailUp: ${readableReport(
                errors
              )})`
            )
        )
      )
    )
    .chain(
      fromPredicate(
        ar => ar.Code === "0",
        ar =>
          new Error(
            `Error sending email using MailUp: ${ar.Code}:${ar.Message}`
          )
      )
    );
}

/**
 * Translates nodemailer parsed addresses ({ name: <name>, address: <address> })
 * to the format expected by the MailUp API ({ Name: <name>, Email: <address> })
 */
function toMailupAddresses(
  addresses: ReadonlyArray<NodemailerAddress>
): ReadonlyArray<Address> {
  return addresses.map((address: NodemailerAddress) => {
    return {
      Email: EmailString.decode(address.address).getOrElseL(() => {
        // this never happens as nodemailer has already parsed
        // the email address (so it's a valid one)
        throw new Error(
          `Error while parsing email address (toMailupAddresses): invalid format '${address.address}'.`
        );
      }),
      Name: address.name || address.address
    };
  });
}

/**
 * Translates nodemailer parsed addresses ({ name: <name>, address: <address> })
 * to the format expected by the MailUp API ({ Name: <name>, Email: <address> })
 * then get the first one from the input array.
 */
function toMailupAddress(
  addresses: ReadonlyArray<NodemailerAddress>
): Option<Address> {
  const addrs = toMailupAddresses(addresses);
  return fromNullable(addrs[0]);
}

/**
 * Nodemailer transport for MailUp transactional APIs
 *
 * see http://help.mailup.com/display/mailupapi/Transactional+Emails+using+APIs
 * and https://nodemailer.com/plugins/create/#transports
 *
 * Usage:
 *
 * const transporter = nodemailer.createTransport(
 *   MailUpTransport({
 *     creds: {
 *       Username: <SMPT+Username>,
 *       Secret: <SMPT+Password>
 *     },
 *     fetchAgent: customFetch
 *   })
 * );
 *
 * transporter
 *   .sendMail({
 *     from:      "foobar@xexample.com",
 *     to:        "deadbeef@xexample.com",
 *     replyTo:   "foobar-reply@xexample.com",
 *     subject:   "lorem ipsum",
 *     text:      "lorem ipsum",
 *     html:      "<b>lorem ipsum</b>"
 *   })
 *   .then(res => console.log(JSON.stringify(res)))
 *   .catch(err => console.error(JSON.stringify(err)));
 */
export function MailUpTransport(
  options: IMailUpTransportOptions
): nodemailer.Transport {
  const fetchAgent =
    options.fetchAgent !== undefined
      ? options.fetchAgent
      : ((nodeFetch as unknown) as typeof fetch);
  return {
    name: TRANSPORT_NAME,

    version: TRANSPORT_VERSION,

    send: (mail, callback) => {
      // We don't extract email addresses from mail.data.from / mail.data.to
      // as they are just strings that can contain invalid addresses.
      // Instead, mail.message.getAddresses() gets the email addresses
      // already validated by nodemailer (or undefined in case there are
      // no valid addresses for one specific field).
      // The following cast exists because of a bug in nodemailer typings
      // (MimeNode.Addresses are *not* just array of strings)
      const addresses: IAddresses = mail.message.getAddresses() as IAddresses;

      // Convert SMTP headers from the format used by nodemailer
      // to (N: <headerName>, V: <headerValue>) tuples
      // used by the MailUp APIs
      const headers = Object.keys(
        mail.data.headers as {
          readonly [s: string]: string;
        }
      ).map(header => ({
        N: header,
        // tslint:disable-next-line:no-any
        V: (mail.data.headers as any)[header]
      }));

      const emailPayload = {
        Bcc: fromNullable(addresses.bcc)
          .map(toMailupAddresses)
          .toUndefined(),
        Cc: fromNullable(addresses.cc)
          .map(toMailupAddresses)
          .toUndefined(),
        ExtendedHeaders: headers,
        From: fromNullable(addresses.from)
          .chain(toMailupAddress)
          .toUndefined(),
        Html: {
          Body: mail.data.html
        },
        ReplyTo: fromNullable(addresses["reply-to"])
          .chain(toMailupAddress)
          .map(addr => addr.Email)
          .toUndefined(),
        Subject: mail.data.subject,
        Text: mail.data.text,
        To: fromNullable(addresses.to)
          .map(toMailupAddresses)
          .toUndefined()
      };

      const errorOrEmail = EmailPayload.decode(emailPayload);

      if (isLeft(errorOrEmail)) {
        const errors = readableReport(errorOrEmail.value);
        winston.error("MailUpTransport|errors", errors);
        return callback(
          new Error(`Invalid email payload: ${errors}`),
          undefined
        );
      }

      const email = errorOrEmail.value;

      sendTransactionalMail(options.creds, email, fetchAgent)
        .run()
        .then(errorOrResponse => {
          if (isRight(errorOrResponse)) {
            // tslint:disable-next-line:no-null-keyword
            return callback(null, {
              ...errorOrResponse.value,
              messageId: mail.data.messageId
            });
          } else {
            return callback(errorOrResponse.value, undefined);
          }
        })
        .catch(e => callback(e, undefined));
    }
  };
}
