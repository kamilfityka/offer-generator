import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Offer } from "@/app/(presentation-generator)/services/api/offers";

interface OffersState {
  offers: Offer[];
  currentOffer: Offer | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: OffersState = {
  offers: [],
  currentOffer: null,
  isLoading: false,
  error: null,
};

const offersSlice = createSlice({
  name: "offers",
  initialState,
  reducers: {
    setOffers(state, action: PayloadAction<Offer[]>) {
      state.offers = action.payload;
    },
    setCurrentOffer(state, action: PayloadAction<Offer | null>) {
      state.currentOffer = action.payload;
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    removeOffer(state, action: PayloadAction<string>) {
      state.offers = state.offers.filter((o) => o.id !== action.payload);
    },
    updateOfferInList(state, action: PayloadAction<Offer>) {
      const idx = state.offers.findIndex((o) => o.id === action.payload.id);
      if (idx !== -1) {
        state.offers[idx] = action.payload;
      }
    },
  },
});

export const {
  setOffers,
  setCurrentOffer,
  setLoading,
  setError,
  removeOffer,
  updateOfferInList,
} = offersSlice.actions;

export default offersSlice.reducer;
