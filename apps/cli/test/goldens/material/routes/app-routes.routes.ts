import type { Routes } from "@angular/router";

export const appRoutes: Routes = [
  {
    path: "users",
    loadComponent: () => import("../components/UserCard.js").then((m) => m.UserCard),
  },
];
