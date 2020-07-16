import * as t from "io-ts";

import { isLeft, isRight } from "fp-ts/lib/Either";

import { Container, ResourceResponse } from "@azure/cosmos";

import { BaseModel, CosmosdbModel, ResourceT } from "../cosmosdb_model";
import { some } from "fp-ts/lib/Option";

beforeEach(() => {
  jest.resetAllMocks();
});

const MyDocument = t.interface({
  test: t.string
});
type MyDocument = t.TypeOf<typeof MyDocument>;

const NewMyDocument = t.intersection([MyDocument, BaseModel]);
type NewMyDocument = t.TypeOf<typeof NewMyDocument>;

const RetrievedMyDocument = t.intersection([MyDocument, ResourceT]);
type RetrievedMyDocument = t.TypeOf<typeof RetrievedMyDocument>;

class MyModel extends CosmosdbModel<
  MyDocument,
  NewMyDocument,
  RetrievedMyDocument
> {
  constructor(c: Container) {
    super(c, NewMyDocument, RetrievedMyDocument);
  }
}

const readMock = jest.fn();
const containerMock = {
  item: jest.fn(),
  items: {
    create: jest.fn(),
    upsert: jest.fn()
  }
};
const container = (containerMock as unknown) as Container;

const aDocument = {
  id: "test-id-1",
  test: "test"
};

export const someMetadata = {
  _etag: "_etag",
  _rid: "_rid",
  _self: "_self",
  _ts: 1
};

describe("create", () => {
  it("should create a document", async () => {
    containerMock.items.create.mockResolvedValueOnce(
      new ResourceResponse(
        {
          ...aDocument,
          ...someMetadata
        },
        {},
        200,
        200
      )
    );
    const model = new MyModel(container);
    const result = await model.create(aDocument).run();
    expect(containerMock.items.create).toHaveBeenCalledWith(aDocument, {
      disableAutomaticIdGeneration: true
    });
    expect(isRight(result));
    if (isRight(result)) {
      expect(result.value).toEqual({
        ...aDocument,
        ...someMetadata
      });
    }
  });

  it("should fail on query error", async () => {
    containerMock.items.create.mockRejectedValueOnce({ code: 500 });
    const model = new MyModel(container);

    const result = await model.create(aDocument).run();
    expect(isLeft(result));
    if (isLeft(result)) {
      expect(result.value.kind).toBe("COSMOS_ERROR_RESPONSE");
      if (result.value.kind === "COSMOS_ERROR_RESPONSE") {
        expect(result.value.error.code).toBe(500);
      }
    }
  });

  it("should fail on empty response", async () => {
    containerMock.items.create.mockResolvedValueOnce({});
    const model = new MyModel(container);

    const result = await model.create(aDocument).run();
    expect(isLeft(result));
    if (isLeft(result)) {
      expect(result.value).toEqual({ kind: "COSMOS_EMPTY_RESPONSE" });
    }
  });
});

describe("upsert", () => {
  it("should create a document", async () => {
    containerMock.items.upsert.mockResolvedValueOnce({});
    const model = new MyModel(container);
    await model.upsert(aDocument).run();
    expect(containerMock.items.upsert).toHaveBeenCalledWith(aDocument, {
      disableAutomaticIdGeneration: true
    });
  });

  it("should fail on query error", async () => {
    containerMock.items.upsert.mockRejectedValueOnce({ code: 500 });
    const model = new MyModel(container);

    const result = await model.upsert(aDocument).run();
    expect(isLeft(result));
    if (isLeft(result)) {
      expect(result.value.kind).toBe("COSMOS_ERROR_RESPONSE");
      if (result.value.kind === "COSMOS_ERROR_RESPONSE") {
        expect(result.value.error.code).toBe(500);
      }
    }
  });

  it("should fail on empty response", async () => {
    containerMock.items.upsert.mockResolvedValueOnce({});
    const model = new MyModel(container);

    const result = await model.upsert(aDocument).run();
    expect(isLeft(result));
    if (isLeft(result)) {
      expect(result.value).toEqual({ kind: "COSMOS_EMPTY_RESPONSE" });
    }
  });

  it("should return the created document as retrieved type", async () => {
    containerMock.items.upsert.mockResolvedValueOnce(
      new ResourceResponse(
        {
          ...aDocument,
          ...someMetadata
        },
        {},
        200,
        200
      )
    );
    const model = new MyModel(container);

    const result = await model.upsert(aDocument).run();
    expect(isRight(result));
    if (isRight(result)) {
      expect(result.value).toEqual({
        ...aDocument,
        ...someMetadata
      });
    }
  });
});

describe("find", () => {
  it("should retrieve an existing document", async () => {
    readMock.mockResolvedValueOnce(
      new ResourceResponse(
        {
          ...aDocument,
          ...someMetadata
        },
        {},
        200,
        200
      )
    );
    containerMock.item.mockReturnValue({ read: readMock });
    const model = new MyModel(container);
    const result = await model.find("test-id-1", "test-partition").run();
    expect(containerMock.item).toHaveBeenCalledWith(
      "test-id-1",
      "test-partition"
    );
    expect(isRight(result)).toBeTruthy();
    if (isRight(result)) {
      expect(result.value.isSome()).toBeTruthy();
      expect(result.value.toUndefined()).toEqual({
        ...aDocument,
        ...someMetadata
      });
    }
  });

  it("should return an empty option if the document does not exist", async () => {
    readMock.mockResolvedValueOnce(
      // TODO: check whether this is what the client actually returns
      new ResourceResponse(undefined, {}, 200, 200)
    );
    containerMock.item.mockReturnValue({ read: readMock });
    const model = new MyModel(container);
    const result = await model.find("test-id-1", "test-partition").run();
    expect(isRight(result)).toBeTruthy();
    if (isRight(result)) {
      expect(result.value.isNone()).toBeTruthy();
    }
  });

  it("should return the query error", async () => {
    readMock.mockRejectedValueOnce(
      // TODO: check whether this is what the client actually returns
      { code: 500 }
    );
    containerMock.item.mockReturnValue({ read: readMock });
    const model = new MyModel(container);
    const result = await model.find("test-id-1", "test-partition").run();
    expect(isLeft(result));
    if (isLeft(result)) {
      expect(result.value.kind).toBe("COSMOS_ERROR_RESPONSE");
      if (result.value.kind === "COSMOS_ERROR_RESPONSE") {
        expect(result.value.error.code).toBe(500);
      }
    }
  });
});
