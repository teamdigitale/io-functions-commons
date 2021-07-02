/* eslint-disable @typescript-eslint/no-explicit-any */

import * as azureStorage from "azure-storage";
import { isLeft, isRight, left, right } from "fp-ts/lib/Either";
import { isSome } from "fp-ts/lib/Option";
import * as asyncI from "../../utils/async";
import * as t from "io-ts";

import { FiscalCode } from "../../../generated/definitions/FiscalCode";
import { MessageBodyMarkdown } from "../../../generated/definitions/MessageBodyMarkdown";
import { MessageContent } from "../../../generated/definitions/MessageContent";

import {
  NonEmptyString,
  OrganizationFiscalCode
} from "@pagopa/ts-commons/lib/strings";

import { fromNullable, none, some } from "fp-ts/lib/Option";

import {
  MessageModel,
  MessageWithContent,
  MessageWithoutContent,
  MessageWithContentWithPaymentData,
  MessageWithContentWithPaymentDataWithoutPayee,
  NewMessageWithContent,
  RetrievedMessage,
  RetrievedMessageWithContent,
  RetrievedMessageWithoutContent,
  RetrievedMessageWithContentWithPaymentData,
  RetrievedMessageWithContentWithPaymentDataWithoutPayee,
  NewMessageWithContentWithPaymentData,
  NewMessageWithContentWithPaymentDataWithoutPayee,
  NewMessageWithoutContent
} from "../message";

jest.mock("../../utils/azure_storage");
import { Container, ResourceResponse } from "@azure/cosmos";
import { MessageSubject } from "../../../generated/definitions/MessageSubject";
import { ServiceId } from "../../../generated/definitions/ServiceId";
import { TimeToLiveSeconds } from "../../../generated/definitions/TimeToLiveSeconds";
import * as azureStorageUtils from "../../utils/azure_storage";
import { PaymentData } from "../../../generated/definitions/PaymentData";
import { PaymentAmount } from "../../../generated/definitions/PaymentAmount";
import { PaymentNoticeNumber } from "../../../generated/definitions/PaymentNoticeNumber";
import { Payee } from "../../../generated/definitions/Payee";
import { CosmosResource } from "../../utils/cosmosdb_model";
import { PaymentDataWithExplicitPayee } from "../../../generated/definitions/PaymentDataWithExplicitPayee";

beforeEach(() => {
  jest.resetAllMocks();
});

const MESSAGE_CONTAINER_NAME = "message-content" as NonEmptyString;

const aMessageBodyMarkdown = "test".repeat(80) as MessageBodyMarkdown;

const aMessageContent: MessageContent = {
  markdown: aMessageBodyMarkdown,
  subject: "test".repeat(10) as MessageSubject
};

const aFiscalCode = "FRLFRC74E04B157I" as FiscalCode;
const anOrganizationFiscalCode = "12345678901" as OrganizationFiscalCode;

const aSerializedNewMessageWithoutContent = {
  createdAt: new Date().toISOString(),
  fiscalCode: aFiscalCode,
  id: "A_MESSAGE_ID" as NonEmptyString,
  indexedId: "A_MESSAGE_ID" as NonEmptyString,
  senderServiceId: "agid" as ServiceId,
  senderUserId: "u123" as NonEmptyString,
  timeToLiveSeconds: 3600 as TimeToLiveSeconds
};

const aSerializedNewMessageWithContent = {
  ...aSerializedNewMessageWithoutContent,
  content: aMessageContent
};

const aNewMessageWithContent: NewMessageWithContent = {
  ...aSerializedNewMessageWithContent,
  createdAt: new Date(),
  kind: "INewMessageWithContent"
};

const aNewMessageWithoutContent: NewMessageWithoutContent = {
  ...aSerializedNewMessageWithoutContent,
  createdAt: new Date(),
  kind: "INewMessageWithoutContent"
};

const aPaymentDataWithoutPayee: PaymentData = {
  amount: 1000 as PaymentAmount,
  notice_number: "177777777777777777" as PaymentNoticeNumber
};
const aPayee: Payee = { fiscal_code: anOrganizationFiscalCode };
const aPaymentDataWithPayee: PaymentDataWithExplicitPayee = {
  ...aPaymentDataWithoutPayee,
  payee: aPayee
};

const aNewMessageWithContentWithPaymentData: NewMessageWithContentWithPaymentData = {
  ...aNewMessageWithContent,
  content: {
    ...aNewMessageWithContent.content,
    payment_data: aPaymentDataWithPayee
  },
  kind: "INewMessageWithContentWithPaymentData"
};
const aNewMessageWithContentWithPaymentDataWithoutPayee: NewMessageWithContentWithPaymentDataWithoutPayee = {
  ...aNewMessageWithContent,
  content: {
    ...aNewMessageWithContent.content,
    payment_data: aPaymentDataWithoutPayee
  },
  kind: "INewMessageWithContentWithPaymentDataWithoutPayee"
};

const aRetrievedMessageWithoutContent = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1,
  ...aNewMessageWithoutContent
};
const aRetrievedMessageWithContent = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1,
  ...aNewMessageWithContent
};
const aRetrievedMessageWithContentWithPaymentData = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1,
  ...aNewMessageWithContentWithPaymentData
};

const aRetrievedMessageWithContentWithPaymentDataWithoutPayee = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1,
  ...aNewMessageWithContentWithPaymentDataWithoutPayee
};

describe("Models ", () => {
  it("should decode MessageWithContentWithPaymentData with payment data with payee", () => {
    const messageWithContentWithPayee = MessageWithContentWithPaymentData.decode(
      aNewMessageWithContentWithPaymentData
    );

    expect(messageWithContentWithPayee.isRight()).toBe(true);
    expect(messageWithContentWithPayee.value).toEqual({
      ...aNewMessageWithContentWithPaymentData,
      content: {
        ...aNewMessageWithContentWithPaymentData.content,
        payment_data: {
          ...aNewMessageWithContentWithPaymentData.content.payment_data,
          invalid_after_due_date: false
        }
      }
    });
  });

  it("should NOT decode MessageWithContentWithPayee with payment data without payee", () => {
    const messageWithContentWithoutPayee = MessageWithContentWithPaymentData.decode(
      aNewMessageWithContentWithPaymentDataWithoutPayee
    );

    expect(messageWithContentWithoutPayee.isLeft()).toBe(true);
  });

  it("should deserialize MessageWithContentWithPaymentDataWithoutPayee with payment data without payee", () => {
    const messageWithContentWithPaymentDataWithoutPayee = MessageWithContentWithPaymentDataWithoutPayee.decode(
      aNewMessageWithContentWithPaymentDataWithoutPayee
    );

    expect(messageWithContentWithPaymentDataWithoutPayee.isRight()).toBe(true);
    expect(messageWithContentWithPaymentDataWithoutPayee.value).toEqual({
      ...aNewMessageWithContentWithPaymentDataWithoutPayee,
      content: {
        ...aNewMessageWithContentWithPaymentDataWithoutPayee.content,
        payment_data: {
          ...aNewMessageWithContentWithPaymentDataWithoutPayee.content
            .payment_data,
          invalid_after_due_date: false
        }
      }
    });
  });

  it("should deserialize MessageWithContent without payment_data", () => {
    expect(MessageWithContent.decode(aNewMessageWithContent).isRight()).toBe(
      true
    );
  });
});

describe("RetrievedMessage", () => {
  it("should deserialize RetrievedMessage without payment_data", () => {
    const val = RetrievedMessage.decode(aRetrievedMessageWithContent);
    expect(val.isRight()).toBe(true);
    expect(val.value).toEqual({
      ...aRetrievedMessageWithContent,
      kind: "IRetrievedMessageWithContent"
    });
  });

  it("should deserialize RetrievedMessage with payment_data without payee", () => {
    const val0 = RetrievedMessage.decode(
      aRetrievedMessageWithContentWithPaymentDataWithoutPayee
    );

    const expected = {
      ...aRetrievedMessageWithContentWithPaymentDataWithoutPayee,
      kind: "IRetrievedMessageWithContentWithPaymentDataWithoutPayee",
      content: {
        ...aRetrievedMessageWithContentWithPaymentDataWithoutPayee.content,
        payment_data: {
          ...aRetrievedMessageWithContentWithPaymentDataWithoutPayee.content
            .payment_data,
          invalid_after_due_date: false
        }
      }
    };

    expect(val0.isRight()).toBe(true);
    expect(val0.value).toEqual(expected);
  });

  it("should deserialize RetrievedMessage without Content", () => {
    const val = RetrievedMessage.decode(aRetrievedMessageWithoutContent);

    const expected = {
      ...aRetrievedMessageWithoutContent,
      kind: "IRetrievedMessageWithoutContent"
    };

    expect(val.isRight()).toBe(true);
    expect(val.value).toEqual(expected);
  });

  it("should deserialize RetrievedMessage with payment_data with payee", () => {
    const val = RetrievedMessage.decode(
      aRetrievedMessageWithContentWithPaymentData
    );

    const expected = {
      ...aRetrievedMessageWithContentWithPaymentData,
      kind: "IRetrievedMessageWithContentWithPaymentData",
      content: {
        ...aRetrievedMessageWithContentWithPaymentData.content,
        payment_data: {
          ...aRetrievedMessageWithContentWithPaymentData.content.payment_data,
          invalid_after_due_date: false
        }
      }
    };

    expect(val.isRight()).toBe(true);
    expect(val.value).toEqual(expected);
  });
});

describe("findMessages", () => {
  it("should return the messages for a fiscal code", async () => {
    const iteratorMock = {
      next: jest.fn(() =>
        Promise.resolve(right([right(aRetrievedMessageWithContent)]))
      )
    };

    const asyncIteratorSpy = jest
      .spyOn(asyncI, "mapAsyncIterable")
      .mockImplementation(() => {
        return {
          [Symbol.asyncIterator]: () => iteratorMock
        };
      });

    const containerMock = ({
      items: {
        query: jest.fn(() => ({
          getAsyncIterator: jest.fn(() => iteratorMock)
        }))
      }
    } as unknown) as Container;

    const model = new MessageModel(containerMock, MESSAGE_CONTAINER_NAME);

    const errorsOrResultIterator = await model
      .findMessages(aRetrievedMessageWithContent.fiscalCode)
      .run();

    expect(asyncIteratorSpy).toHaveBeenCalledTimes(1);
    expect(containerMock.items.query).toHaveBeenCalledTimes(1);
    expect(isRight(errorsOrResultIterator)).toBeTruthy();
    if (isRight(errorsOrResultIterator)) {
      const result = await errorsOrResultIterator.value.next();
      expect(isRight(result.value[0])).toBeTruthy();
      if (isRight(result.value[0])) {
        const item = result.value[0].value;
        expect(item).toEqual(aRetrievedMessageWithContent);
      }
    }
  });

  it("should return an empty iterator if fiscalCode doesn't match", async () => {
    const iteratorMock = {
      next: jest.fn(() => Promise.resolve(right([])))
    };

    const asyncIteratorSpy = jest
      .spyOn(asyncI, "mapAsyncIterable")
      // eslint-disable-next-line sonarjs/no-identical-functions
      .mockImplementation(() => {
        return {
          [Symbol.asyncIterator]: () => iteratorMock
        };
      });

    const containerMock = ({
      items: {
        query: jest.fn(() => ({
          getAsyncIterator: jest.fn(() => iteratorMock)
        }))
      }
    } as unknown) as Container;

    const model = new MessageModel(containerMock, MESSAGE_CONTAINER_NAME);

    const errorsOrResultIterator = await model
      .findMessages(aRetrievedMessageWithContent.fiscalCode)
      .run();

    expect(asyncIteratorSpy).toHaveBeenCalledTimes(1);
    expect(containerMock.items.query).toHaveBeenCalledTimes(1);
    expect(isRight(errorsOrResultIterator)).toBeTruthy();
    if (isRight(errorsOrResultIterator)) {
      const result = await errorsOrResultIterator.value.next();
      expect(result.value).toMatchObject([]);
    }
  });
});

describe("findMessageForRecipient", () => {
  it("should return the messages if the recipient matches", async () => {
    const readMock = jest.fn().mockResolvedValueOnce(
      new ResourceResponse(
        {
          ...aRetrievedMessageWithContent
        },
        {},
        200,
        200
      )
    );
    const containerMock = ({
      item: jest.fn().mockReturnValue({ read: readMock })
    } as unknown) as Container;

    const model = new MessageModel(containerMock, MESSAGE_CONTAINER_NAME);

    const result = await model
      .findMessageForRecipient(
        aRetrievedMessageWithContent.fiscalCode,
        aRetrievedMessageWithContent.id
      )
      .run();

    expect(containerMock.item).toHaveBeenCalledTimes(1);
    expect(isRight(result)).toBeTruthy();
    if (isRight(result)) {
      expect(result.value.isSome()).toBeTruthy();
      expect(result.value.toUndefined()).toEqual({
        ...aRetrievedMessageWithContent,
        kind: "IRetrievedMessageWithContent"
      });
    }
  });

  it("should return an empty value if the recipient doesn't match", async () => {
    const readMock = jest
      .fn()
      .mockResolvedValueOnce(new ResourceResponse(undefined, {}, 200, 200));
    const containerMock = ({
      item: jest.fn().mockReturnValue({ read: readMock })
    } as unknown) as Container;

    const model = new MessageModel(containerMock, MESSAGE_CONTAINER_NAME);

    const result = await model
      .findMessageForRecipient(
        "FRLFRC73E04B157I" as FiscalCode,
        aRetrievedMessageWithContent.id
      )
      .run();

    expect(containerMock.item).toHaveBeenCalledTimes(1);
    expect(isRight(result)).toBeTruthy();
    if (isRight(result)) {
      expect(result.value.isNone()).toBeTruthy();
    }
  });

  it("should return an error", async () => {
    const readMock = jest.fn().mockRejectedValueOnce({ code: 500 });
    const containerMock = ({
      item: jest.fn().mockReturnValue({ read: readMock })
    } as unknown) as Container;

    const model = new MessageModel(containerMock, MESSAGE_CONTAINER_NAME);

    const result = await model
      .findMessageForRecipient(
        "FRLFRC73E04B157I" as FiscalCode,
        aRetrievedMessageWithContent.id
      )
      .run();

    expect(containerMock.item).toHaveBeenCalledTimes(1);
    expect(isLeft(result)).toBeTruthy();
    if (isLeft(result)) {
      expect(result.value.kind).toEqual("COSMOS_ERROR_RESPONSE");
    }
  });
});

describe("storeContentAsBlob", () => {
  const aMessageId = "MESSAGE_ID";
  const aBlobResult = {
    name: "blobName"
  } as azureStorage.BlobService.BlobResult;
  it("should save the message content in a blob", async () => {
    const blobServiceMock = {};

    const containerMock = ({} as unknown) as Container;
    const model = new MessageModel(containerMock, MESSAGE_CONTAINER_NAME);

    const upsertBlobFromObjectSpy = jest
      .spyOn(azureStorageUtils, "upsertBlobFromObject")
      .mockReturnValueOnce(Promise.resolve(right(fromNullable(aBlobResult))));

    const blob = await model
      .storeContentAsBlob(blobServiceMock as any, aMessageId, aMessageContent)
      .run();

    expect(upsertBlobFromObjectSpy).toBeCalledWith(
      blobServiceMock,
      expect.any(String),
      expect.any(String),
      aMessageContent
    );
    expect(isRight(blob)).toBeTruthy();
    if (isRight(blob)) {
      expect(blob.value.map(b => expect(b).toEqual(aBlobResult)));
    }

    upsertBlobFromObjectSpy.mockReset();
  });
});

describe("getContentFromBlob", () => {
  const aMessageId = "MESSAGE_ID";
  const blobServiceMock = {};
  const containerMock = ({} as unknown) as Container;
  const model = new MessageModel(containerMock, MESSAGE_CONTAINER_NAME);

  it("should get message content from stored blob", async () => {
    const getBlobAsTextSpy = jest
      .spyOn(azureStorageUtils, "getBlobAsText")
      .mockReturnValueOnce(
        Promise.resolve(right(some(JSON.stringify(aMessageContent))))
      );

    const errorOrMaybeMessageContent = await model
      .getContentFromBlob(blobServiceMock as any, aMessageId)
      .run();

    expect(getBlobAsTextSpy).toBeCalledWith(
      blobServiceMock,
      expect.any(String), // Container name
      `${aMessageId}.json`
    );
    expect(isRight(errorOrMaybeMessageContent)).toBeTruthy();
    if (isRight(errorOrMaybeMessageContent)) {
      const maybeMessageContent = errorOrMaybeMessageContent.value;
      expect(isSome(maybeMessageContent)).toBeTruthy();
      if (isSome(maybeMessageContent)) {
        expect(maybeMessageContent.value).toEqual(aMessageContent);
      }
    }

    getBlobAsTextSpy.mockReset();
  });

  it("should fail with an error when the blob cannot be retrieved", async () => {
    const err = Error();
    const getBlobAsTextSpy = jest
      .spyOn(azureStorageUtils, "getBlobAsText")
      .mockReturnValueOnce(Promise.resolve(left(err)));

    const errorOrMaybeMessageContent = await model
      .getContentFromBlob(blobServiceMock as any, aMessageId)
      .run();

    expect(isLeft(errorOrMaybeMessageContent)).toBeTruthy();
    expect(errorOrMaybeMessageContent.value).toEqual(err);

    getBlobAsTextSpy.mockReset();
  });

  it("should fail with an error when the retrieved blob is empty", async () => {
    const getBlobAsTextSpy = jest
      .spyOn(azureStorageUtils, "getBlobAsText")
      .mockResolvedValueOnce(right(none));

    const errorOrMaybeMessageContent = await model
      .getContentFromBlob(blobServiceMock as any, aMessageId)
      .run();

    expect(isLeft(errorOrMaybeMessageContent)).toBeTruthy();
    expect(errorOrMaybeMessageContent.value).toBeInstanceOf(Error);

    getBlobAsTextSpy.mockReset();
  });

  it("should fail with an error when the retrieved blob can't be decoded", async () => {
    const invalidMessageContent = {};
    const getBlobAsTextSpy = jest
      .spyOn(azureStorageUtils, "getBlobAsText")
      .mockResolvedValueOnce(
        right(some(JSON.stringify(invalidMessageContent)))
      );

    const errorOrMaybeMessageContent = await model
      .getContentFromBlob(blobServiceMock as any, aMessageId)
      .run();

    expect(isLeft(errorOrMaybeMessageContent)).toBeTruthy();
    expect(errorOrMaybeMessageContent.value).toBeInstanceOf(Error);

    getBlobAsTextSpy.mockReset();
  });
});
