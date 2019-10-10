/**
 * Utility functions to interact with an Azure Storage.
 */
import * as azureStorage from "azure-storage";
import * as t from "io-ts";

import { Either, left, right } from "fp-ts/lib/Either";
import { fromNullable, isNone, none, Option, some } from "fp-ts/lib/Option";
import { readableReport } from "italia-ts-commons/lib/reporters";

type Resolve<T> = (value?: T | PromiseLike<T>) => void;

type StorageError = Error & {
  code?: string;
};

// Blob storage stuff
export const BlobNotFoundCode = "BlobNotFound";

/**
 * Utility function to avoid code duplication detection by tslint
 */
const resolveErrorOrLeaseResult = (
  resolve: Resolve<Either<Error, azureStorage.BlobService.LeaseResult>>
) => (
  err: Error,
  result: azureStorage.BlobService.LeaseResult,
  _: azureStorage.ServiceResponse
) => {
  if (err) {
    return resolve(left(err));
  } else {
    return resolve(right(result));
  }
};

/**
 * Acquire lease for a blob.
 *
 * @param blobService     the Azure blob service
 * @param containerName   the name of the Azure blob storage container
 * @param blobName        blob file name
 */
export function acquireLease(
  blobService: azureStorage.BlobService,
  containerName: string,
  blobName: string,
  options: azureStorage.BlobService.AcquireLeaseRequestOptions = {}
): Promise<Either<Error, azureStorage.BlobService.LeaseResult>> {
  return new Promise(resolve => {
    blobService.acquireLease(
      containerName,
      blobName,
      options,
      resolveErrorOrLeaseResult(resolve)
    );
  });
}

/**
 * Release lease for a blob.
 *
 * @param blobService     the Azure blob service
 * @param containerName   the name of the Azure blob storage container
 * @param blobName        blob file name
 * @param leaseId         the id of the lease returned by acquireLease method
 */
export function releaseLease(
  blobService: azureStorage.BlobService,
  containerName: string,
  blobName: string,
  leaseId: string,
  options: azureStorage.BlobService.AcquireLeaseRequestOptions = {}
): Promise<Either<Error, azureStorage.BlobService.LeaseResult>> {
  return new Promise(resolve => {
    blobService.releaseLease(
      containerName,
      blobName,
      leaseId,
      options,
      resolveErrorOrLeaseResult(resolve)
    );
  });
}

/**
 * Create a new blob (media) from plain text.
 * Assumes that the container <containerName> already exists.
 *
 * @param blobService     the Azure blob service
 * @param containerName   the name of the Azure blob storage container
 * @param blobName        blob storage container name
 * @param text            text to be saved
 */
export function upsertBlobFromText(
  blobService: azureStorage.BlobService,
  containerName: string,
  blobName: string,
  text: string | Buffer,
  options: azureStorage.BlobService.CreateBlobRequestOptions = {}
): Promise<Either<Error, Option<azureStorage.BlobService.BlobResult>>> {
  return new Promise(resolve =>
    blobService.createBlockBlobFromText(
      containerName,
      blobName,
      text,
      options,
      (err, result, __) => {
        if (err) {
          return resolve(
            left<Error, Option<azureStorage.BlobService.BlobResult>>(err)
          );
        } else {
          return resolve(
            right<Error, Option<azureStorage.BlobService.BlobResult>>(
              fromNullable(result)
            )
          );
        }
      }
    )
  );
}

/**
 * Create a new blob (media) from a typed object.
 * Assumes that the container <containerName> already exists.
 *
 * @param blobService     the Azure blob service
 * @param containerName   the name of the Azure blob storage container
 * @param blobName        blob storage container name
 * @param content         object to be serialized and saved
 */
export function upsertBlobFromObject<T>(
  blobService: azureStorage.BlobService,
  containerName: string,
  blobName: string,
  content: T,
  options: azureStorage.BlobService.CreateBlobRequestOptions = {}
): Promise<Either<Error, Option<azureStorage.BlobService.BlobResult>>> {
  return upsertBlobFromText(
    blobService,
    containerName,
    blobName,
    JSON.stringify(content),
    options
  );
}

/**
 * Get a blob content as text (string).
 *
 * @param blobService     the Azure blob service
 * @param containerName   the name of the Azure blob storage container
 * @param blobName        blob file name
 */
export function getBlobAsText(
  blobService: azureStorage.BlobService,
  containerName: string,
  blobName: string,
  options: azureStorage.BlobService.GetBlobRequestOptions = {}
): Promise<Either<Error, Option<string>>> {
  return new Promise(resolve => {
    blobService.getBlobToText(
      containerName,
      blobName,
      options,
      (err, result, __) => {
        if (err) {
          // tslint:disable-next-line: no-any
          const errorAsStorageError = err as StorageError;
          if (
            errorAsStorageError.code !== undefined &&
            errorAsStorageError.code === BlobNotFoundCode
          ) {
            return resolve(right<Error, Option<string>>(none));
          }
          return resolve(left<Error, Option<string>>(err));
        } else {
          return resolve(right<Error, Option<string>>(fromNullable(result)));
        }
      }
    );
  });
}

/**
 * Get a blob content as a typed (io-ts) object.
 *
 * @param blobService     the Azure blob service
 * @param containerName   the name of the Azure blob storage container
 * @param blobName        blob file name
 */
export async function getBlobAsObject<A, O, I>(
  type: t.Type<A, O, I>,
  blobService: azureStorage.BlobService,
  containerName: string,
  blobName: string,
  options: azureStorage.BlobService.GetBlobRequestOptions = {}
): Promise<Either<Error, Option<A>>> {
  const errorOrMaybeText = await getBlobAsText(
    blobService,
    containerName,
    blobName,
    options
  );
  return errorOrMaybeText.chain(maybeText => {
    if (isNone(maybeText)) {
      return right(none);
    }

    const text = maybeText.value;
    try {
      const json = JSON.parse(text);
      return type
        .decode(json)
        .fold<Either<Error, Option<A>>>(
          err => left(new Error(readableReport(err))),
          _ => right(some(_))
        );
    } catch (e) {
      return left(e);
    }
  });
}

// Table storage stuff
export const TableEntity = t.interface({
  PartitionKey: t.string,
  RowKey: t.string
});
export type ITableEntity = t.TypeOf<typeof TableEntity>;

const ResourceNotFoundCode = "ResourceNotFound";

// TODO: Improve typing
/**
 * The TableService retrieveEntity function returns an object with a format like
 *
 * `"Key": {"&": DataType, "_": Value}`
 *
 * this function converts to an object containing only the values like:
 *
 * `"Key": Value`
 *
 * @param entityResult the object returned by TableService retrieveEntity function
 */
// tslint:disable-next-line: no-any
export function getValueOnlyEntityResolver(entityResult: any): any {
  // tslint:disable-next-line: no-any
  return Object.keys(entityResult).reduce<any>((accumulator, key) => {
    return {
      ...accumulator,
      [key]: entityResult[key]._
    };
  }, {});
}

/**
 * Insert an entity in table storage
 *
 * @param tableService the Azure table service
 * @param tableName the name of the table
 * @param entity the entity to store
 */
export async function insertTableEntity<T extends ITableEntity>(
  tableService: azureStorage.TableService,
  tableName: string,
  entity: T
): Promise<Either<Error, azureStorage.TableService.EntityMetadata>> {
  return new Promise(resolve => {
    // tslint:disable-next-line: no-identical-functions
    tableService.insertEntity<T>(tableName, entity, (err, result, _) => {
      if (err) {
        return resolve(left(err));
      } else {
        return resolve(right(result));
      }
    });
  });
}

/**
 * Retrieve an entity from table storage
 *
 * @param type used to decode the result
 * @param tableService the Azure table service
 * @param tableName the name of the table
 * @param partitionKey
 * @param rowKey
 */
export async function retrieveTableEntity<A, O, I>(
  type: t.Type<A, O, I>,
  tableService: azureStorage.TableService,
  tableName: string,
  partitionKey: string,
  rowKey: string,
  options: azureStorage.TableService.TableEntityRequestOptions = {
    entityResolver: getValueOnlyEntityResolver
  }
): Promise<Either<Error, Option<A>>> {
  return new Promise(resolve => {
    tableService.retrieveEntity<I>(
      tableName,
      partitionKey,
      rowKey,
      options,
      (err, result, _) => {
        if (err) {
          const errorAsStorageError = err as StorageError;
          if (errorAsStorageError.code === ResourceNotFoundCode) {
            return resolve(right(none));
          }
          return resolve(left(err));
        } else {
          return resolve(
            type
              .decode(result)
              .fold(
                e => left(new Error(readableReport(e))),
                v => right(some(v))
              )
          );
        }
      }
    );
  });
}
