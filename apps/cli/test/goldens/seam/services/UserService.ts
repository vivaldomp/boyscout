import { userService as impl } from "../../src/services/user-service.js";

export interface UserServiceContract {
  getUsers(): Promise<string[]>;
}

export const userService: UserServiceContract = impl;
