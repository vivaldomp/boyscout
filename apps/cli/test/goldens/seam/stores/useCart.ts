import { useReducer } from "react";
import { cartHandlers } from "../../src/stores/cart.js";

export type CartState = { items: string[] };

export type CartAction = { type: "addItem"; payload: string } | { type: "clear"; payload: void };

export interface CartHandlers {
  addItem(state: CartState, payload: string): CartState;
  clear(state: CartState, payload: void): CartState;
}

const handlers: CartHandlers = cartHandlers;

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "addItem":
      return handlers.addItem(state, action.payload);
    case "clear":
      return handlers.clear(state, action.payload);
  }
}

export function useCart(initial: CartState) {
  return useReducer(reducer, initial);
}
