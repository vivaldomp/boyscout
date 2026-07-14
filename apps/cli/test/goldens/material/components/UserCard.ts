import { Component } from "@angular/core";
import { MatCard } from "@angular/material/card";
import { MatCardContent } from "@angular/material/card";
import { MatCardTitle } from "@angular/material/card";
import { MatList } from "@angular/material/list";
import { MatListItem } from "@angular/material/list";
@Component({
  standalone: true,
  selector: "user-card",
  imports: [MatCard, MatCardContent, MatCardTitle, MatList, MatListItem],
  template: `<mat-card><mat-card-title>Overview</mat-card-title><mat-card-content><mat-list><mat-list-item>Alice</mat-list-item></mat-list></mat-card-content></mat-card>`,
})
export class UserCard {}
