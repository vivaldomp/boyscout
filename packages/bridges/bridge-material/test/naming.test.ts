import { describe, expect, it } from "vitest";
import { camel, kebab, pascal } from "../src/naming.js";

describe("naming", () => {
  it("kebab splits camelCase and non-alphanumerics", () => {
    expect(kebab("UsersApi")).toBe("users-api");
    expect(kebab("user service")).toBe("user-service");
  });
  it("camel lower-cases the first word", () => {
    expect(camel("UsersApi")).toBe("usersApi");
  });
  it("pascal upper-cases the first word", () => {
    expect(pascal("users-api")).toBe("UsersApi");
    expect(pascal("usersApi")).toBe("UsersApi");
  });
});
