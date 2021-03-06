/**
 * Mailer module
 *
 * This is the entrypoint of the mailer module, which is spread over multiple files in this directory.
 * Ideally this is the only file that's needed to be imported when apps want to send email.
 */

import { agent } from "@pagopa/ts-commons";
import {
  AbortableFetch,
  setFetchTimeout,
  toFetch
} from "@pagopa/ts-commons/lib/fetch";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { Millisecond } from "@pagopa/ts-commons/lib/units";
import { fromNullable, none, Option, some } from "fp-ts/lib/Option";

import {
  MailerConfig,
  MailhogMailerConfig,
  MailupMailerConfig,
  MultiTrasnsportMailerConfig,
  SendgridMailerConfig
} from "./config";

import {
  createMailTransporter,
  getTransportsForConnections,
  MailerTransporter,
  MailUpTransport,
  MultiTransport,
  NodeMailerSendgrid,
  Transport
} from "./transports";

// expects a never value. return a constant or the value itself
const defaultNever = <T>(e: never, retVal: T = e): T => retVal;

// Some transports require http connections, this is the default client
const defaultFetchAgent = toFetch(
  setFetchTimeout(
    5000 as Millisecond, // 5 seconds timeout by default
    AbortableFetch(agent.getHttpsFetch(process.env))
  )
);

/**
 * Create a mail transporter object inferring the type from a given configuration
 *
 * @param config the configuration provided.
 * @param fetchAgent optional fetch function to be used by whose transport that use http connctions. A default with 5s timeout is used if no agent is passed.
 *
 * @returns a mail transporter object
 * @throws an error creating the transporter
 */
export const getMailerTransporter = (
  config: MailerConfig,
  fetchAgent: typeof fetch = defaultFetchAgent
): MailerTransporter => {
  const maybeTransportOpts: Option<
    | Transport
    | {
        readonly host: NonEmptyString;
        readonly port: number;
        readonly secure: boolean;
      }
  > = SendgridMailerConfig.is(config)
    ? some(
        NodeMailerSendgrid({
          apiKey: config.SENDGRID_API_KEY
        })
      )
    : MailupMailerConfig.is(config)
    ? some(
        MailUpTransport({
          creds: {
            Secret: config.MAILUP_SECRET,
            Username: config.MAILUP_USERNAME
          },
          // HTTPS-only fetch with optional keepalive agent
          fetchAgent
        })
      )
    : MultiTrasnsportMailerConfig.is(config)
    ? fromNullable(
        MultiTransport(
          getTransportsForConnections(config.MAIL_TRANSPORTS, fetchAgent)
        )
      )
    : MailhogMailerConfig.is(config)
    ? some({
        host: config.MAILHOG_HOSTNAME,
        port: 1025,
        secure: false
      })
    : defaultNever(config, none);

  return maybeTransportOpts.map(createMailTransporter).getOrElseL(() => {
    throw new Error(
      "Failed to choose a mail transport based on provided configuration"
    );
  });
};

// expose inner stuff as public module interface
export { MailerConfig } from "./config";
export { sendMail, MailerTransporter } from "./transports";
