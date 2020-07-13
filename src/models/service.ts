import * as t from "io-ts";

import {
  CosmosdbModelVersioned,
  VersionedModel
} from "../utils/cosmosdb_model_versioned";

import { Option } from "fp-ts/lib/Option";

import { Set } from "json-set-map";

import { CIDR } from "../../generated/definitions/CIDR";

import {
  FiscalCode,
  NonEmptyString,
  OrganizationFiscalCode
} from "italia-ts-commons/lib/strings";

import {
  readonlySetType,
  withDefault
} from "italia-ts-commons/lib/types";
import { MaxAllowedPaymentAmount } from "../../generated/definitions/MaxAllowedPaymentAmount";
import { ServiceScope } from "../../generated/definitions/ServiceScope";
import { wrapWithKind } from "../utils/types";
import { BaseModel, CosmosErrors } from "../utils/cosmosdb_model";
import { Container } from "@azure/cosmos";
import { TaskEither } from "fp-ts/lib/TaskEither";

export const SERVICE_COLLECTION_NAME = "services";
export const SERVICE_MODEL_PK_FIELD = "serviceId";

// required attributes
const ServiceMetadataR = t.interface({
  scope: ServiceScope
});

// optional attributes
const ServiceMetadataO = t.partial({
  description: NonEmptyString,

  webUrl: NonEmptyString,

  appIos: NonEmptyString,

  appAndroid: NonEmptyString,

  tosUrl: NonEmptyString,

  privacyUrl: NonEmptyString,

  address: NonEmptyString,

  phone: NonEmptyString,

  email: NonEmptyString,

  pec: NonEmptyString
});

export const ServiceMetadata = t.intersection(
  [ServiceMetadataR, ServiceMetadataO],
  "ServiceMetadata"
);

export type ServiceMetadata = t.TypeOf<typeof ServiceMetadata>;

/**
 * Base interface for Service objects
 */
const ServiceR = t.interface({
  // authorized source CIDRs
  authorizedCIDRs: readonlySetType(CIDR, "CIDRs"),
  // list of authorized fiscal codes
  authorizedRecipients: readonlySetType(FiscalCode, "fiscal codes"),
  // the name of the department within the service
  departmentName: NonEmptyString,
  // wether the service appears in the service list
  isVisible: withDefault(t.boolean, false),
  // maximum amount in euro cents that the service
  // can charge to a specific user (0 if the service cannot send payment requests)
  maxAllowedPaymentAmount: MaxAllowedPaymentAmount,
  // fiscal code of the organization, used to receive payments
  organizationFiscalCode: OrganizationFiscalCode,
  // the name of the organization
  organizationName: NonEmptyString,
  // if the service require secure channels
  requireSecureChannels: withDefault(t.boolean, false),
  // this equals user's subscriptionId
  serviceId: NonEmptyString,
  // the name of the service
  serviceName: NonEmptyString
});

const ServiceO = t.partial({
  // the metadata of the service
  serviceMetadata: ServiceMetadata
});

export const Service = t.intersection([ServiceR, ServiceO], "Service");

export type Service = t.TypeOf<typeof Service>;

export const NewService = wrapWithKind(
  t.intersection([Service, VersionedModel, BaseModel]),
  "INewService" as const
); 

export type NewService = t.TypeOf<typeof NewService>;

export const RetrievedService = wrapWithKind(
  t.intersection([Service, VersionedModel, BaseModel]),
  "IRetrievedService" as const
);

export type RetrievedService = t.TypeOf<typeof RetrievedService>;

/**
 * Converts an Array or a Set of strings to a ReadonlySet of fiscalCodes.
 *
 * We need to handle Arrays as this method is called by database finders
 * who retrieve a plain json object.
 *
 * We need to handle Sets as this method is called on Service objects
 * passed to create(Service) and update(Service) model methods.
 *
 * @param authorizedRecipients  Array or Set of authorized fiscal codes
 *                              for this service.
 *
 * @deprecated Use the Service validation to do the conversion.
 */
export function toAuthorizedRecipients(
  authorizedRecipients: ReadonlyArray<string> | ReadonlySet<string> | undefined
): ReadonlySet<FiscalCode> {
  return new Set(Array.from(authorizedRecipients || []).filter(FiscalCode.is));
}

/**
 * @see toAuthorizedRecipients
 * @param authorizedCIDRs   Array or Set of authorized CIDRs for this service.
 *
 * @deprecated Use the Service validation to do the conversion.
 */
export function toAuthorizedCIDRs(
  authorizedCIDRs: ReadonlyArray<string> | ReadonlySet<string> | undefined
): ReadonlySet<CIDR> {
  return new Set(Array.from(authorizedCIDRs || []).filter(CIDR.is));
}

/**
 * A model for handling Services
 */
export class ServiceModel extends CosmosdbModelVersioned<
  Service,
  NewService,
  RetrievedService
> {
  /**
   * Creates a new Service model
   *
   * @param dbClient the DocumentDB client
   * @param collectionUrl the collection URL
   */
  constructor(
    container: Container
  ) {
    super(container, NewService, RetrievedService, "serviceId");
  }

  public findOneByServiceId(
    serviceId: NonEmptyString
  ): TaskEither<CosmosErrors, Option<RetrievedService>> {
    return super.findLastVersionByModelId(
      serviceId,
      serviceId
    );
  }
}
