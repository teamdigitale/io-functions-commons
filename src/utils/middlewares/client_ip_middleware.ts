import * as requestIp from "request-ip";
import * as winston from "winston";

import { IPString } from "@pagopa/ts-commons/lib/strings";
import { right } from "fp-ts/lib/Either";
import { fromEither as OptionFromEither, Option } from "fp-ts/lib/Option";
import { IRequestMiddleware } from "../request_middleware";

export type ClientIp = Option<IPString>;

/**
 * A middleware that extracts the client IP from the request.
 *
 * The algorithm to extract the IP is documented here:
 * https://www.npmjs.com/package/request-ip#how-it-works
 *
 * If you call Functions logic bypassing the API gateway
 * the IP will be null and the middleware will return None.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const ClientIpMiddleware: IRequestMiddleware<
  never,
  ClientIp
> = request =>
  new Promise(resolve => {
    const clientIp = requestIp.getClientIp(request);
    winston.debug(`Handling request for client IP|${clientIp}`);
    resolve(
      right<never, ClientIp>(OptionFromEither(IPString.decode(clientIp)))
    );
  });
