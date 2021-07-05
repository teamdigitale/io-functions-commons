import { isLeft, isRight } from "fp-ts/lib/Either";

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { FiscalCode } from "../../../generated/definitions/FiscalCode";

import {
  makeServicesPreferencesDocumentId,
  NewServicePreference,
  RetrievedServicePreference,
  ServicePreference,
  ServicesPreferencesModel,
  SERVICE_PREFERENCES_COLLECTION_NAME
} from "../service_preference";

import { Container } from "@azure/cosmos";

const aFiscalCode = "FRLFRC74E04B157I" as FiscalCode;
const aServiceId = "aServiceId" as NonEmptyString;

const aStoredServicePreference: ServicePreference = {
  fiscalCode: aFiscalCode,
  serviceId: aServiceId,
  isEmailEnabled: true,
  isInboxEnabled: true,
  settingsVersion: 0 as NonNegativeInteger,
  isWebhookEnabled: true
};

const aNewServicePreference: NewServicePreference = {
  id: makeServicesPreferencesDocumentId(
    aFiscalCode,
    aServiceId,
    0 as NonNegativeInteger
  ),
  fiscalCode: aFiscalCode,
  serviceId: aServiceId,
  isEmailEnabled: true,
  isInboxEnabled: true,
  settingsVersion: 0 as NonNegativeInteger,
  kind: "INewServicePreference",
  isWebhookEnabled: true
};

const aRetrievedServicePreference: RetrievedServicePreference = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1,
  id: makeServicesPreferencesDocumentId(
    aFiscalCode,
    aServiceId,
    0 as NonNegativeInteger
  ),
  kind: "IRetrievedServicePreference",
  ...aStoredServicePreference
};

describe("find", () => {
  it("should resolve to an existing profile", async () => {
    const containerMock = ({
      item: jest.fn().mockImplementation((_, __) => ({
        read: jest.fn(() =>
          Promise.resolve({
            resource: aRetrievedServicePreference
          })
        )
      }))
    } as unknown) as Container;

    const model = new ServicesPreferencesModel(
      containerMock
    );

    const result = await model
      .find([
        makeServicesPreferencesDocumentId(
          aFiscalCode,
          aServiceId,
          0 as NonNegativeInteger
        ),
        aFiscalCode
      ])
      .run();

    expect(isRight(result)).toBeTruthy();
    if (isRight(result)) {
      expect(result.value.isSome()).toBeTruthy();
      expect(result.value.toUndefined()).toEqual(aRetrievedServicePreference);
    }
  });

  it("should resolve to empty if no profile is found", async () => {
    const containerMock = ({
      item: jest.fn().mockImplementation((_, __) => ({
        read: jest.fn(() =>
          Promise.resolve({
            resource: undefined
          })
        )
      }))
    } as unknown) as Container;

    const model = new ServicesPreferencesModel(
      containerMock
    );

    const result = await model
      .find([
        makeServicesPreferencesDocumentId(
          aFiscalCode,
          aServiceId,
          0 as NonNegativeInteger
        ),
        aFiscalCode
      ])
      .run();

    expect(isRight(result)).toBeTruthy();
    if (isRight(result)) {
      expect(result.value.isNone()).toBeTruthy();
    }
  });

  it("should validate the retrieved object agains the model type", async () => {
    const containerMock = ({
      item: jest.fn().mockImplementation((_, __) => ({
        read: jest.fn(() =>
          Promise.resolve({
            resource: {}
          })
        )
      }))
    } as unknown) as Container;

    const model = new ServicesPreferencesModel(
      containerMock
    );

    const result = await model
      .find([
        makeServicesPreferencesDocumentId(
          aFiscalCode,
          aServiceId,
          0 as NonNegativeInteger
        ),
        aFiscalCode
      ])
      .run();

    expect(isLeft(result)).toBeTruthy();
    if (isLeft(result)) {
      expect(result.value.kind).toBe("COSMOS_DECODING_ERROR");
    }
  });
});

describe("create ServicePreference", () => {
  it("should create a new document", async () => {
    const containerMock = ({
      items: {
        create: jest.fn((_, __) =>
          Promise.resolve({
            resource: aRetrievedServicePreference
          })
        )
      }
    } as unknown) as Container;
    const model = new ServicesPreferencesModel(
      containerMock
    );

    const result = await model.create(aNewServicePreference).run();

    expect(isRight(result)).toBeTruthy();
    if (isRight(result)) {
      expect(result.value).toEqual(aRetrievedServicePreference);
    }
  });
});
