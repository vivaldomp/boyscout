import { Component, inject } from "@angular/core";
import { NonNullableFormBuilder, ReactiveFormsModule } from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";

@Component({
  standalone: true,
  selector: "signup-form",
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `<form [formGroup]="form"><mat-form-field><mat-label>Email</mat-label><input matInput type="text" formControlName="email"></mat-form-field><mat-form-field><mat-label>Age</mat-label><input matInput type="number" formControlName="age"></mat-form-field><button mat-button type="submit">Submit</button></form>`,
})
export class SignupForm {
  private readonly fb = inject(NonNullableFormBuilder);
  readonly form = this.fb.group({
    email: this.fb.control<string>(""),
    age: this.fb.control<number>(0),
  });
}
