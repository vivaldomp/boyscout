import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { map, type Observable } from "rxjs";
import { usersApiTransforms } from "../../src/http/users-api.transforms.js";

export interface UsersApiTransforms {
  getUsers(raw: unknown): string[];
}

const transforms: UsersApiTransforms = usersApiTransforms;

@Injectable({ providedIn: "root" })
export class UsersApiService {
  private readonly http = inject(HttpClient);

  getUsers(): Observable<string[]> {
    return this.http.request<unknown>("GET", "/users").pipe(map((raw) => transforms.getUsers(raw)));
  }
}
