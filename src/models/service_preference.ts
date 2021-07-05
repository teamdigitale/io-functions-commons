import * as t from "io-ts";

import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { Container, RequestOptions } from "@azure/cosmos";
import { TaskEither } from "fp-ts/lib/TaskEither";
import { ServiceId } from "../../generated/definitions/ServiceId";
import {
  BaseModel,
  CosmosdbModel,
  CosmosErrors,
  CosmosResource
} from "../utils/cosmosdb_model";
import { wrapWithKind } from "../utils/types";

export const SERVICE_PREFERENCES_COLLECTION_NAME = "services-preferences" as NonEmptyString;
export const SERVICE_PREFERENCES_MODEL_PK_FIELD = "fiscalCode" as const;

/**
 * Base interface for ServicePreference objects
 */
export const ServicePreference = t.interface({
  // the fiscal code of the citized associated to this service preference
  fiscalCode: FiscalCode,

  // whether to send email notifications for a specific service
  isEmailEnabled: t.boolean,

  // whether to store the content of messages sent to this citizen from a specific service
  isInboxEnabled: t.boolean,

  // whether to push notifications to the default webhook for a specific service
  isWebhookEnabled: t.boolean,

  // the identifier of the service to which this preference refers
  // this equals user's subscriptionId
  serviceId: ServiceId,

  // the service preference version
  // this value refers to servicePreferencesSettings.version in user Profile
  settingsVersion: NonNegativeInteger
});
export type ServicePreference = t.TypeOf<typeof ServicePreference>;

export const NewServicePreference = wrapWithKind(
  t.intersection([ServicePreference, BaseModel]),
  "INewServicePreference" as const
);
export type NewServicePreference = t.TypeOf<typeof NewServicePreference>;

export const RetrievedServicePreference = wrapWithKind(
  t.intersection([ServicePreference, CosmosResource]),
  "IRetrievedServicePreference" as const
);

export type RetrievedServicePreference = t.TypeOf<
  typeof RetrievedServicePreference
>;

export const makeServicesPreferencesDocumentId = (
  fiscalCode: FiscalCode,
  serviceId: ServiceId,
  settingsVersion: NonNegativeInteger
): NonEmptyString => {
  const paddingLength = 16; // length of Number.MAX_SAFE_INTEGER == 9007199254740991
  const paddedVersion = (
    "0".repeat(paddingLength) + String(settingsVersion)
  ).slice(-paddingLength);
  return `${fiscalCode}-${serviceId}-${paddedVersion}` as NonEmptyString;
};

export class ServicesPreferencesModel extends CosmosdbModel<
  ServicePreference,
  NewServicePreference,
  RetrievedServicePreference,
  typeof SERVICE_PREFERENCES_MODEL_PK_FIELD
> {
  /**
   * Creates a new ServicePreference model
   *
   * @param container the Cosmos container client
   */
  constructor(container: Container) {
    super(container, NewServicePreference, RetrievedServicePreference);
  }

  /**
   * Create a new document for a service preference
   *
   * The ID of this document is generated from the properties
   * - fiscalCode
   * - serviceId
   * - version
   *
   * @param newDocument the document to be saved
   * @param options query options for the db operation
   */
  public create(
    newDocument: NewServicePreference,
    options?: RequestOptions
  ): TaskEither<CosmosErrors, RetrievedServicePreference> {
    return super.create(
      {
        ...newDocument,
        id: makeServicesPreferencesDocumentId(
          newDocument.fiscalCode,
          newDocument.serviceId,
          newDocument.settingsVersion
        )
      },
      options
    );
  }

  /**
   * Create a new document or update an existing one for a service preference
   *
   * The ID of this document is generated from the properties
   * - fiscalCode
   * - serviceId
   * - version
   *
   * @param document the document to be saved
   * @param options query options for the db operation
   */
  public upsert(
    document: NewServicePreference,
    options?: RequestOptions
  ): TaskEither<CosmosErrors, RetrievedServicePreference> {
    return super.upsert(
      {
        ...document,
        id: makeServicesPreferencesDocumentId(
          document.fiscalCode,
          document.serviceId,
          document.settingsVersion
        )
      },
      options
    );
  }
}
