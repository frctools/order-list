const defaultParseOptions: Required<ParseOptions> = {
  decodeValues: true,
  map: false,
  silent: false,
};

export interface ParseOptions {
  decodeValues?: boolean;
  map?: boolean;
  silent?: boolean;
}

export interface Cookie {
  name: string;
  value: string;
  expires?: Date;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  partitioned?: boolean;
  [key: string]: unknown;
}

export type CookieMap = Record<string, Cookie>;

type HeadersRecord = Record<string, unknown> & {
  getSetCookie?: () => string[];
};

type InputWithHeaders = {
  headers: HeadersRecord;
};

type ParseInput = string | string[] | InputWithHeaders | null | undefined;

function isNonEmptyString(str: unknown): str is string {
  return typeof str === "string" && str.trim().length > 0;
}

function parseNameValuePair(nameValuePairStr: string): {
  name: string;
  value: string;
} {
  // Parses name-value-pair according to rfc6265bis draft
  const nameValueArr = nameValuePairStr.split("=");

  if (nameValueArr.length > 1) {
    const name = nameValueArr.shift() ?? "";
    const value = nameValueArr.join("=");
    return { name, value };
  }

  return { name: "", value: nameValuePairStr };
}

export function parseString(
  setCookieValue: string,
  options?: ParseOptions,
): Cookie {
  const parts = setCookieValue.split(";").filter(isNonEmptyString);
  const nameValuePairStr = parts.shift() ?? "";
  const parsed = parseNameValuePair(nameValuePairStr);
  const { name } = parsed;
  let { value } = parsed;

  const optionsWithDefaults = {
    ...defaultParseOptions,
    ...(options ?? {}),
  };

  try {
    value = optionsWithDefaults.decodeValues
      ? decodeURIComponent(value)
      : value;
  } catch (error) {
    console.error(
      "set-cookie-parser encountered an error while decoding a cookie with value '" +
        value +
        "'. Set options.decodeValues to false to disable this feature.",
      error,
    );
  }

  const cookie: Cookie = {
    name,
    value,
  };

  parts.forEach((part) => {
    const sides = part.split("=");
    const key = sides.shift()?.trimStart().toLowerCase() ?? "";
    const attributeValue = sides.join("=");

    if (key === "expires") {
      cookie.expires = new Date(attributeValue);
    } else if (key === "max-age") {
      cookie.maxAge = parseInt(attributeValue, 10);
    } else if (key === "secure") {
      cookie.secure = true;
    } else if (key === "httponly") {
      cookie.httpOnly = true;
    } else if (key === "samesite") {
      cookie.sameSite = attributeValue;
    } else if (key === "partitioned") {
      cookie.partitioned = true;
    } else if (key) {
      cookie[key] = attributeValue;
    }
  });

  return cookie;
}

type ParseReturn<TOptions extends ParseOptions | undefined> = TOptions extends {
  map: true;
}
  ? CookieMap
  : Cookie[];

export function parse<TOptions extends ParseOptions | undefined = undefined>(
  input?: ParseInput,
  options?: TOptions,
): ParseReturn<TOptions> {
  const optionsWithDefaults = {
    ...defaultParseOptions,
    ...(options ?? {}),
  };

  if (!input) {
    return (optionsWithDefaults.map ? {} : []) as ParseReturn<TOptions>;
  }

  if (
    typeof input === "object" &&
    !Array.isArray(input) &&
    "headers" in input
  ) {
    const headers = input.headers;

    if (
      headers &&
      typeof (headers as HeadersRecord).getSetCookie === "function"
    ) {
      const getSetCookie = (headers as HeadersRecord).getSetCookie;
      if (typeof getSetCookie === "function") {
        input = getSetCookie();
      }
    } else if (headers && typeof headers === "object") {
      const headerRecord = headers as Record<string, unknown>;
      const setCookieHeader = headerRecord["set-cookie"];

      if (setCookieHeader) {
        input = setCookieHeader as string | string[];
      } else {
        const key = Object.keys(headerRecord).find(
          (headerKey) => headerKey.toLowerCase() === "set-cookie",
        );

        const sch = key ? (headerRecord[key] as string | string[]) : undefined;

        if (!sch && headerRecord.cookie && !optionsWithDefaults.silent) {
          console.warn(
            "Warning: set-cookie-parser appears to have been called on a request object. It is designed to parse Set-Cookie headers from responses, not Cookie headers from requests. Set the option {silent: true} to suppress this warning.",
          );
        }

        input = sch;
      }
    }
  }

  const cookiesArray = Array.isArray(input) ? input : [input];

  if (!optionsWithDefaults.map) {
    return cookiesArray
      .filter(isNonEmptyString)
      .map((str) =>
        parseString(str, optionsWithDefaults),
      ) as ParseReturn<TOptions>;
  }

  const cookies: CookieMap = {};

  return cookiesArray.filter(isNonEmptyString).reduce<CookieMap>((acc, str) => {
    const cookie = parseString(str, optionsWithDefaults);
    acc[cookie.name] = cookie;
    return acc;
  }, cookies) as ParseReturn<TOptions>;
}

/*
  Set-Cookie header field-values are sometimes comma joined in one string. This splits them without choking on commas
  that are within a single set-cookie field-value, such as in the Expires portion.

  This is uncommon, but explicitly allowed - see https://tools.ietf.org/html/rfc2616#section-4.2
  Node.js does this for every header *except* set-cookie - see https://github.com/nodejs/node/blob/d5e363b77ebaf1caf67cd7528224b651c86815c1/lib/_http_incoming.js#L128
  React Native's fetch does this for *every* header, including set-cookie.

  Based on: https://github.com/google/j2objc/commit/16820fdbc8f76ca0c33472810ce0cb03d20efe25
  Credits to: https://github.com/tomball for original and https://github.com/chrusart for JavaScript implementation
*/
export function splitCookiesString(cookiesString: unknown): string[] {
  if (Array.isArray(cookiesString)) {
    return cookiesString;
  }
  if (typeof cookiesString !== "string") {
    return [];
  }

  const cookiesStrings: string[] = [];
  let pos = 0;
  let start: number;
  let ch = "";
  let lastComma: number;
  let nextStart: number;
  let cookiesSeparatorFound: boolean;

  const skipWhitespace = () => {
    while (pos < cookiesString.length && /\s/.test(cookiesString.charAt(pos))) {
      pos += 1;
    }
    return pos < cookiesString.length;
  };

  const notSpecialChar = () => {
    ch = cookiesString.charAt(pos);
    return ch !== "=" && ch !== ";" && ch !== ",";
  };

  while (pos < cookiesString.length) {
    start = pos;
    cookiesSeparatorFound = false;

    while (skipWhitespace()) {
      ch = cookiesString.charAt(pos);
      if (ch === ",") {
        // ',' is a cookie separator if we have later first '=', not ';' or ','
        lastComma = pos;
        pos += 1;

        skipWhitespace();
        nextStart = pos;

        while (pos < cookiesString.length && notSpecialChar()) {
          pos += 1;
        }

        // currently special character
        if (pos < cookiesString.length && cookiesString.charAt(pos) === "=") {
          // we found cookies separator
          cookiesSeparatorFound = true;
          // pos is inside the next cookie, so back up and return it.
          pos = nextStart;
          cookiesStrings.push(cookiesString.substring(start, lastComma));
          start = pos;
        } else {
          // in param ',' or param separator ';',
          // we continue from that comma
          pos = lastComma + 1;
        }
      } else {
        pos += 1;
      }
    }

    if (!cookiesSeparatorFound || pos >= cookiesString.length) {
      cookiesStrings.push(cookiesString.substring(start, cookiesString.length));
    }
  }

  return cookiesStrings;
}

export default parse;

export type { ParseInput };
