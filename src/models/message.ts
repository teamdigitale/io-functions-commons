import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { BlobService } from "azure-storage";
import { array } from "fp-ts/lib/Array";
import {
  either,
  fromOption,
  parseJSON,
  right,
  toError,
  tryCatch2v
} from "fp-ts/lib/Either";
import { fromNullable, none, Option, some } from "fp-ts/lib/Option";
import * as t from "io-ts";
import {
  Container,
  FeedOptions,
  FeedResponse,
  SqlQuerySpec
} from "@azure/cosmos";
import {
  fromEither as fromEitherT,
  fromLeft,
  TaskEither,
  taskEither,
  tryCatch as tryCatchT
} from "fp-ts/lib/TaskEither";
import {
  BaseModel,
  CosmosdbModel,
  CosmosDecodingError,
  CosmosErrors,
  CosmosResource,
  toCosmosErrorResponse
} from "../utils/cosmosdb_model";

import { MessageContent } from "../../generated/definitions/MessageContent";

import { FiscalCode } from "../../generated/definitions/FiscalCode";

import { ServiceId } from "../../generated/definitions/ServiceId";
import { Timestamp } from "../../generated/definitions/Timestamp";
import { TimeToLiveSeconds } from "../../generated/definitions/TimeToLiveSeconds";
import { getBlobAsText, upsertBlobFromObject } from "../utils/azure_storage";
import { wrapWithKind } from "../utils/types";
import { PaymentDataBase } from "../../generated/definitions/PaymentDataBase";
import { PaymentDataWithExplicitPayee } from "../../generated/definitions/PaymentDataWithExplicitPayee";
import { MessageContentBase } from "../../generated/definitions/MessageContentBase";

export const MESSAGE_COLLECTION_NAME = "messages";
export const MESSAGE_MODEL_PK_FIELD = "fiscalCode" as const;

const MESSAGE_BLOB_STORAGE_SUFFIX = ".json";

const MessageBaseR = t.interface({
  // when the message was accepted by the system
  createdAt: Timestamp,

  // the fiscal code of the recipient
  fiscalCode: FiscalCode,

  // needed to order by id or to make range queries (ie. WHERE id > "string")
  // see https://stackoverflow.com/questions/48710600/azure-cosmosdb-how-to-order-by-id
  indexedId: NonEmptyString,

  // the identifier of the service of the sender
  senderServiceId: ServiceId,

  // the userId of the sender (this is opaque and depends on the API gateway)
  senderUserId: NonEmptyString,

  // time to live in seconds
  timeToLiveSeconds: TimeToLiveSeconds
});

const MessageBaseO = t.partial({
  // When true, the message is still being processed and should be
  // hidden from the result of getMessages requests. This is needed to avoid
  // cases where getMessages returns messages without content - i.e. messages
  // that didn't pass the checks done by created_message_queue_handler before
  // storing the message content.
  isPending: t.boolean
});

const MessageBase = t.intersection([MessageBaseR, MessageBaseO], "MessageBase");

/**
 * The attributes common to all types of Message
 */
type MessageBase = t.TypeOf<typeof MessageBase>;

/**
 * A Message without content.
 *
 * A Message gets stored without content if the recipient didn't opt-in
 * to have the content of the messages permanently stored in his inbox.
 */
export type MessageWithoutContent = MessageBase;
export const MessageWithoutContent = MessageBase;

/**
 * A Message with content
 *
 * A Message gets stored with content if the recipient opted-in
 * to have the content of the messages permanently stored in his inbox.
 */
export const MessageWithContent = t.intersection([
  t.interface({
    content: MessageContentBase
  }),
  MessageBase
]);

export type MessageWithContent = t.TypeOf<typeof MessageWithContent>;

/**
 * A Message with content with payment data
 *
 * A Message gets stored with content if the recipient opted-in
 * to have the content of the messages permanently stored in his inbox.
 */
export const MessageWithContentWithPaymentData = t.intersection([
  t.interface({
    content: t.intersection([
      MessageContentBase,
      t.interface({ payment_data: PaymentDataWithExplicitPayee })
    ])
  }),
  MessageBase
]);

export type MessageWithContentWithPaymentData = t.TypeOf<
  typeof MessageWithContentWithPaymentData
>;

/**
 * A Message with content with legacy payment data (without payee)
 *
 * A Message gets stored with content if the recipient opted-in
 * to have the content of the messages permanently stored in his inbox.
 */
export const MessageWithContentWithPaymentDataWithoutPayee = t.intersection([
  t.interface({
    content: t.intersection([
      MessageContentBase,
      t.interface({ payment_data: PaymentDataBase })
    ])
  }),
  MessageBase
]);

export type MessageWithContentWithPaymentDataWithoutPayee = t.TypeOf<
  typeof MessageWithContentWithPaymentDataWithoutPayee
>;

/**
 * A Message can be with our without content
 */
export const Message = t.union([
  MessageWithContentWithPaymentData,
  MessageWithContentWithPaymentDataWithoutPayee,
  MessageWithContent,
  MessageWithoutContent
]);

export type Message = t.TypeOf<typeof Message>;

export const NewMessageWithContent = wrapWithKind(
  t.intersection([MessageWithContent, BaseModel]),
  "INewMessageWithContent" as const
);

export type NewMessageWithContent = t.TypeOf<typeof NewMessageWithContent>;

export const NewMessageWithContentWithPaymentData = wrapWithKind(
  t.intersection([MessageWithContentWithPaymentData, BaseModel]),
  "INewMessageWithContentWithPaymentData" as const
);

export type NewMessageWithContentWithPaymentData = t.TypeOf<
  typeof NewMessageWithContentWithPaymentData
>;

export const NewMessageWithContentWithPaymentDataWithoutPayee = wrapWithKind(
  t.intersection([MessageWithContentWithPaymentDataWithoutPayee, BaseModel]),
  "INewMessageWithContentWithPaymentDataWithoutPayee" as const
);

export type NewMessageWithContentWithPaymentDataWithoutPayee = t.TypeOf<
  typeof NewMessageWithContentWithPaymentDataWithoutPayee
>;

export const NewMessageWithoutContent = wrapWithKind(
  t.intersection([MessageWithoutContent, BaseModel]),
  "INewMessageWithoutContent" as const
);

export type NewMessageWithoutContent = t.TypeOf<
  typeof NewMessageWithoutContent
>;

/**
 * A (yet to be saved) Message
 */
export const NewMessage = t.union([
  NewMessageWithContentWithPaymentData,
  NewMessageWithContentWithPaymentDataWithoutPayee,
  NewMessageWithContent,
  NewMessageWithoutContent
]);

export type NewMessage = t.TypeOf<typeof NewMessage>;

export const RetrievedMessageWithContent = wrapWithKind(
  t.intersection([MessageWithContent, CosmosResource]),
  "IRetrievedMessageWithContent" as const
);

export type RetrievedMessageWithContent = t.TypeOf<
  typeof RetrievedMessageWithContent
>;

export const RetrievedMessageWithContentWithPaymentData = wrapWithKind(
  t.intersection([MessageWithContentWithPaymentData, CosmosResource]),
  "IRetrievedMessageWithContentWithPaymentData" as const
);

export type RetrievedMessageWithContentWithPaymentData = t.TypeOf<
  typeof RetrievedMessageWithContentWithPaymentData
>;

export const RetrievedMessageWithContentWithPaymentDataWithoutPayee = wrapWithKind(
  t.intersection([
    MessageWithContentWithPaymentDataWithoutPayee,
    CosmosResource
  ]),
  "IRetrievedMessageWithContentWithPaymentDataWithoutPayee" as const
);

export type RetrievedMessageWithContentWithPaymentDataWithoutPayee = t.TypeOf<
  typeof RetrievedMessageWithContentWithPaymentDataWithoutPayee
>;

export const RetrievedMessageWithoutContent = wrapWithKind(
  t.intersection([MessageWithoutContent, CosmosResource]),
  "IRetrievedMessageWithoutContent" as const
);

export type RetrievedMessageWithoutContent = t.TypeOf<
  typeof RetrievedMessageWithoutContent
>;

export const ActiveMessage = t.refinement(
  MessageBase,
  message =>
    Date.now() - message.createdAt.getTime() <=
    message.timeToLiveSeconds * 1000,
  "NotExpiredMessage"
);

export type NotExpiredMessage = t.TypeOf<typeof ActiveMessage>;

/**
 * A (previously saved) retrieved Message
 */
export const RetrievedMessage = t.union([
  RetrievedMessageWithContentWithPaymentData,
  RetrievedMessageWithContentWithPaymentDataWithoutPayee,
  RetrievedMessageWithContent,
  RetrievedMessageWithoutContent
]);

export type RetrievedMessage = t.TypeOf<typeof RetrievedMessage>;

const blobIdFromMessageId = (messageId: string): string =>
  `${messageId}${MESSAGE_BLOB_STORAGE_SUFFIX}`;

/**
 * A model for handling Messages
 */
export class MessageModel extends CosmosdbModel<
  Message,
  NewMessage,
  RetrievedMessage,
  typeof MESSAGE_MODEL_PK_FIELD
> {
  /**
   * Creates a new Message model
   *
   * @param container the Cosmos container client
   */
  constructor(
    container: Container,
    protected readonly containerName: NonEmptyString
  ) {
    super(container, NewMessage, RetrievedMessage);
  }

  /**
   * Returns the message for the provided fiscal code and message ID
   *
   * @param fiscalCode The fiscal code of the recipient
   * @param messageId The ID of the message
   */
  public findMessageForRecipient(
    fiscalCode: FiscalCode,
    messageId: NonEmptyString
  ): TaskEither<CosmosErrors, Option<RetrievedMessage>> {
    return this.find([messageId, fiscalCode]).map(maybeMessage =>
      maybeMessage.filter(m => m.fiscalCode === fiscalCode)
    );
  }

  /**
   * Returns the messages for the provided fiscal code
   *
   * @param fiscalCode The fiscal code of the recipient
   */
  public findMessages(
    fiscalCode: FiscalCode
  ): TaskEither<
    CosmosErrors,
    AsyncIterator<ReadonlyArray<t.Validation<RetrievedMessage>>>
  > {
    return fromEitherT(
      tryCatch2v(
        () =>
          this.getQueryIterator({
            parameters: [
              {
                name: "@fiscalCode",
                value: fiscalCode
              }
            ],
            query: `SELECT * FROM m WHERE m.${MESSAGE_MODEL_PK_FIELD} = @fiscalCode`
          })[Symbol.asyncIterator](),
        toCosmosErrorResponse
      )
    );
  }

  /**
   * @deprecated use getQueryIterator + asyncIterableToArray
   */
  public findAllByQuery(
    query: string | SqlQuerySpec,
    options?: FeedOptions
  ): TaskEither<
    CosmosErrors,
    Option<ReadonlyArray<RetrievedMessageWithoutContent>>
  > {
    return tryCatchT<
      CosmosErrors,
      // eslint-disable-next-line @typescript-eslint/array-type
      FeedResponse<readonly RetrievedMessageWithoutContent[]>
    >(
      () =>
        this.container.items
          // eslint-disable-next-line @typescript-eslint/array-type
          .query<readonly RetrievedMessageWithoutContent[]>(query, options)
          .fetchAll(),
      toCosmosErrorResponse
    )
      .map(_ => fromNullable(_.resources))
      .chain(_ =>
        _.isSome()
          ? fromEitherT(
              array.sequence(either)(
                _.value.map(RetrievedMessageWithoutContent.decode)
              )
            )
              .map(some)
              .mapLeft(CosmosDecodingError)
          : fromEitherT(right(none))
      );
  }

  /**
   * Store the message content in a blob
   *
   * @param blobService The azure.BlobService used to store the media
   * @param messageId The id of the message used to set the blob name
   * @param messageContent The content to store in the blob
   */
  public storeContentAsBlob(
    blobService: BlobService,
    messageId: string,
    messageContent: MessageContent
  ): TaskEither<Error, Option<BlobService.BlobResult>> {
    // Set the blob name
    const blobName = blobIdFromMessageId(messageId);

    // Store message content in blob storage
    return tryCatchT(
      () =>
        upsertBlobFromObject<MessageContent>(
          blobService,
          this.containerName,
          blobName,
          messageContent
        ),
      toError
    ).chain(fromEitherT);
  }

  /**
   * Retrieve the message content from a blob
   *
   * @param blobService The azure.BlobService used to store the media
   * @param messageId The id of the message used to set the blob name
   */
  public getContentFromBlob(
    blobService: BlobService,
    messageId: string
  ): TaskEither<Error, Option<MessageContent>> {
    const blobId = blobIdFromMessageId(messageId);

    // Retrieve blob content and deserialize
    return (
      tryCatchT(
        () => getBlobAsText(blobService, this.containerName, blobId),
        toError
      )
        .chain(fromEitherT)
        .chain(maybeContentAsText =>
          fromEitherT(
            fromOption(
              // Blob exists but the content is empty
              new Error("Cannot get stored message content from blob")
            )(maybeContentAsText)
          )
        )
        // Try to decode the MessageContent
        .chain(contentAsText =>
          parseJSON(contentAsText, toError).fold(
            _ => fromLeft(new Error(`Cannot parse content text into object`)),
            _ => taskEither.of(_)
          )
        )
        .chain(undecodedContent =>
          MessageContent.decode(undecodedContent).fold(
            errors =>
              fromLeft(
                new Error(
                  `Cannot deserialize stored message content: ${readableReport(
                    errors
                  )}`
                )
              ),
            (content: MessageContent) => taskEither.of(some(content))
          )
        )
    );
  }
}
