/* tslint:disable:no-any */
/* tslint:disable:no-identical-functions */

import { isLeft, isRight } from "fp-ts/lib/Either";

import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";
import { FiscalCode } from "../../../generated/definitions/FiscalCode";

import { Container, FeedResponse, ResourceResponse } from "@azure/cosmos";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { UserDataProcessingChoiceEnum } from "../../../generated/definitions/UserDataProcessingChoice";
import { UserDataProcessingStatusEnum } from "../../../generated/definitions/UserDataProcessingStatus";
import {
  makeUserDataProcessingId,
  NewUserDataProcessing,
  RetrievedUserDataProcessing,
  UserDataProcessing,
  UserDataProcessingModel
} from "../user_data_processing";

const aFiscalCode = "FRLFRC74E04B157I" as FiscalCode;
const aUserDataProcessingChoice = UserDataProcessingChoiceEnum.DOWNLOAD;
const aUserDataProcessingStatus = UserDataProcessingStatusEnum.PENDING;
const aModelId = makeUserDataProcessingId(
  aUserDataProcessingChoice,
  aFiscalCode
);
const aDate = new Date();

const aRetrievedUserDataProcessing: RetrievedUserDataProcessing = {
  choice: aUserDataProcessingChoice,
  createdAt: aDate,
  fiscalCode: aFiscalCode,
  id: (aModelId as unknown) as NonEmptyString,
  kind: "IRetrievedUserDataProcessing",
  status: aUserDataProcessingStatus,
  userDataProcessingId: aModelId,
  version: 0 as NonNegativeInteger
};

const aUserDataProcessing: UserDataProcessing = {
  choice: aUserDataProcessingChoice,
  createdAt: aDate,
  fiscalCode: aFiscalCode,
  status: aUserDataProcessingStatus,
  updatedAt: aDate,
  userDataProcessingId: aModelId
};

const aNewUserDataProcessing: NewUserDataProcessing = {
  ...aUserDataProcessing,
  kind: "INewUserDataProcessing"
};

const someMetadata = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
};

describe("createOrUpdateByNewOne", () => {
  it("should upsert an existing user data processing", async () => {
    const containerMock = ({
      items: {
        create: jest.fn().mockResolvedValueOnce(
          new ResourceResponse(
            {
              ...aNewUserDataProcessing,
              ...someMetadata,
              // tslint:disable-next-line: restrict-plus-operands
              id: aModelId + "1",
              test: "anUpdatedUserDataProcessing",
              version: 1
            },
            {},
            200,
            200
          )
        ),
        query: jest.fn(() => ({
          fetchAll: jest.fn(() =>
            Promise.resolve(
              new FeedResponse([aRetrievedUserDataProcessing], {}, false)
            )
          )
        }))
      }
    } as unknown) as Container;

    const model = new UserDataProcessingModel(containerMock);

    const result = await model
      .createOrUpdateByNewOne(aUserDataProcessing)
      .run();

    expect(containerMock.items.create).toHaveBeenCalledTimes(1);
    expect(isRight(result)).toBeTruthy();
    if (isRight(result)) {
      expect(result.value.updatedAt).toEqual(aNewUserDataProcessing.createdAt);
      expect(result.value.userDataProcessingId).toEqual(
        `${aNewUserDataProcessing.userDataProcessingId}`
      );
    }
  });

  it("should return a CosmosErrors in case of errors", async () => {
    const containerMock = ({
      items: {
        create: jest.fn().mockRejectedValueOnce({ code: 500 }),
        query: jest.fn(() => ({
          fetchAll: jest.fn(() =>
            Promise.resolve({
              resources: [aRetrievedUserDataProcessing]
            })
          )
        }))
      }
    } as unknown) as Container;

    const model = new UserDataProcessingModel(containerMock);

    const result = await model
      .createOrUpdateByNewOne(aUserDataProcessing)
      .run();

    expect(containerMock.items.create).toHaveBeenCalledTimes(1);

    expect(isLeft(result)).toBeTruthy();
    if (isLeft(result)) {
      expect(result.value.kind).toEqual("COSMOS_ERROR_RESPONSE");
    }
  });
});
