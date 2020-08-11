import {
  BaseModel,
  CosmosdbModel,
  CosmosErrors,
  CosmosResource,
  DocumentSearchKey
} from "./cosmosdb_model";

import * as t from "io-ts";

import { Option } from "fp-ts/lib/Option";
import { TaskEither } from "fp-ts/lib/TaskEither";

import { NonNegativeInteger } from "italia-ts-commons/lib/numbers";

import {
  Container,
  ItemDefinition,
  RequestOptions,
  SqlQuerySpec
} from "@azure/cosmos";
import { NonEmptyString } from "italia-ts-commons/lib/strings";

/**
 * A NewVersionedModel may provide an optional version for new items
 */
export const NewVersionedModel = t.partial({});

export type NewVersionedModel = t.TypeOf<typeof NewVersionedModel>;

/**
 * A RetrievedVersionedModel should track the version of the model
 */
export const RetrievedVersionedModel = t.intersection([
  CosmosResource,
  t.interface({
    version: NonNegativeInteger
  })
]);

export type RetrievedVersionedModel = t.TypeOf<typeof RetrievedVersionedModel>;

/**
 * Returns a string with a composite id that has the format:
 * MODEL_ID-VERSION
 *
 * MODEL_ID is the base model ID
 * VERSION is the zero-padded version of the model
 *
 * @param modelId The base model ID
 * @param version The version of the model
 */
export function generateVersionedModelId<T, ModelIdKey extends keyof T>(
  modelId: T[ModelIdKey],
  version: NonNegativeInteger
): NonEmptyString {
  const paddingLength = 16; // length of Number.MAX_SAFE_INTEGER == 9007199254740991
  const paddedVersion = ("0".repeat(paddingLength) + String(version)).slice(
    -paddingLength
  );
  return `${String(modelId)}-${paddedVersion}` as NonEmptyString;
}

export const incVersion = (version: NonNegativeInteger) =>
  (Number(version) + 1) as NonNegativeInteger;

/**
 * Assumption: the model ID is also the partition key
 */
export abstract class CosmosdbModelVersioned<
  T,
  TN extends Readonly<T & Partial<NewVersionedModel>>,
  TR extends Readonly<T & RetrievedVersionedModel>,
  ModelIdKey extends keyof T,
  PartitionKey extends keyof T = ModelIdKey
> extends CosmosdbModel<T, TN & BaseModel, TR, PartitionKey> {
  constructor(
    container: Container,
    protected readonly newVersionedItemT: t.Type<TN, ItemDefinition, unknown>,
    protected readonly retrievedItemT: t.Type<TR, unknown, unknown>,
    protected readonly modelIdKey: ModelIdKey,
    protected readonly partitionKey?: PartitionKey
  ) {
    super(
      container,
      t.intersection([newVersionedItemT, BaseModel]),
      retrievedItemT
    );
  }

  /**
   * Create the first revision of a document.
   *
   * The version will be set to 0 regardless
   * of the value of the provided one (if any).
   *
   * A 409 Conflict error will be raised by the db engine
   * if a document with the same modelId already exists.
   *
   * @param o the document to be saved
   * @param options query options for the db operation
   */
  public create(o: TN, options?: RequestOptions): TaskEither<CosmosErrors, TR> {
    return this.createNewVersion(o, 0 as NonNegativeInteger, options);
  }

  /**
   * Force create a new revision of a document from a full item definition.
   *
   * The version of the new revision is always computed by getting the latest one
   * from the database. Any eventual value of the provided version is thus ignored.
   *
   * Use this method to force creating the latest revision of a document,
   * regardless of any concurrent modification already happened.
   *
   * This method never returns 409 Conflict.
   *
   * @param o the item to be updated
   * @param requestOptions query options for the db operation
   */
  public upsert(
    o: TN,
    requestOptions?: RequestOptions
  ): TaskEither<CosmosErrors, TR> {
    return this.getNextVersion(this.getSearchKey(o)).chain(nextVersion =>
      this.createNewVersion(o, nextVersion, requestOptions)
    );
  }

  /**
   * Try to create a new revision of a document from a full item definition
   * with a specific version provided.
   *
   * The version of the new created document is always computed
   * incrementing the one passed with the input document:
   * the caller must provide an item retrived from the database
   * without incrementing the version itself.
   *
   * A 409 Conflict error will be raised by the db engine
   * if a document with the same (modelId, version + 1) already exists.
   *
   * Use this method to update a model which was already retrieved
   * when you want the update to fail in case of previous (concurrent) updates.
   *
   * @param o the document to be saved
   * @param requestOptions query options for the db operation
   */
  public update(
    o: TR,
    requestOptions?: RequestOptions
  ): TaskEither<CosmosErrors, TR> {
    return this.createNewVersion(
      this.toBaseType(o),
      incVersion(o.version),
      requestOptions
    );
  }

  /**
   *  Find the last version of a document.
   *
   *  Pass the partitionKey field / values if it differs from the modelId
   *  to avoid multi-partition queries.
   */
  public findLastVersionByModelId(
    searchKey: DocumentSearchKey<T, ModelIdKey, PartitionKey>
  ): TaskEither<CosmosErrors, Option<TR>> {
    const [modelId, partitionKey] = searchKey;
    const q: SqlQuerySpec = {
      parameters: [
        {
          name: "@modelId",
          value: modelId
        }
      ],
      // Note: do not use ${collectionName} here as it may contain special characters
      query: `SELECT * FROM m WHERE m.${this.modelIdKey} = @modelId ORDER BY m.version DESC`
    };
    return super.findOneByQuery(q, {
      maxItemCount: 1,
      partitionKey: partitionKey !== undefined ? partitionKey : modelId
    });
  }

  /**
   * Given a document, extract the tuple that define the search key for it
   * @param document
   */
  protected getSearchKey(
    document: T
  ): DocumentSearchKey<T, ModelIdKey, PartitionKey> {
    const pk: PartitionKey | undefined = this.partitionKey;
    const id: ModelIdKey = this.modelIdKey;
    const searchKey =
      typeof pk === "undefined"
        ? [document[id]]
        : // this cast is needed as "Generics extending unions cannot be narrowed"
          // @see https://github.com/microsoft/TypeScript/issues/13995
          [document[id], document[(pk as unknown) as keyof T]];

    return (searchKey as unknown) as DocumentSearchKey<
      T,
      ModelIdKey,
      PartitionKey
    >;
  }

  /**
   * Returns the value of the model ID for the provided item
   */
  protected getModelId = (o: T): T[ModelIdKey] => o[this.modelIdKey];

  /**
   * Returns the next version for the model which `id` is `modelId`.
   *
   * The next version will be the last one from the database incremented by 1 or
   * 0 if no previous version exists in the database.
   */
  private getNextVersion = (
    searchKey: DocumentSearchKey<T, ModelIdKey, PartitionKey>
  ) =>
    this.findLastVersionByModelId(searchKey).map(maybeLastVersion =>
      maybeLastVersion
        .map(_ => incVersion(_.version))
        .getOrElse(0 as NonNegativeInteger)
    );

  /**
   * Insert a document with a specific version
   * @param o
   * @param version
   * @param requestOptions
   */
  private createNewVersion(
    o: T,
    version: NonNegativeInteger,
    requestOptions?: RequestOptions
  ): TaskEither<CosmosErrors, TR> {
    const modelId = this.getModelId(o);
    return super.create(
      {
        ...o,
        id: generateVersionedModelId(modelId, version),
        version
      } as TN & RetrievedVersionedModel,
      requestOptions
    );
  }

  /**
   * Strips off meta fields which are nor part of the base model definition
   */
  private toBaseType(o: TR): T {
    const { _etag, _rid, _self, _ts, id, version, ...n } = o;
    return (n as unknown) as T;
  }
}
