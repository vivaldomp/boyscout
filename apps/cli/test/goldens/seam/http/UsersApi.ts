import { usersApiTransforms } from "../../src/http/users-api.js";

export interface UsersApiTransforms {
  getUsers(raw: unknown): string[];
}

const transforms: UsersApiTransforms = usersApiTransforms;

export const usersApi = {
  async getUsers(): Promise<string[]> {
    const res = await fetch("/users", { method: "GET" });
    return transforms.getUsers(await res.json());
  },
};
