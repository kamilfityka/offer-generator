"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw, Trash2, FileText, Eye } from "lucide-react";
import { toast } from "sonner";

import Wrapper from "@/components/Wrapper";
import { Button } from "@/components/ui/button";
import { OffersApi, Offer } from "@/app/(presentation-generator)/services/api/offers";
import OfferCard from "./OfferCard";
import OffersHeader from "./OffersHeader";

const OffersPage: React.FC = () => {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const fetchOffers = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await OffersApi.getOffers();
      data.sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setOffers(data);
    } catch {
      setOffers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [fetchOffers]);

  const handleDelete = async (offerId: string) => {
    const result = await OffersApi.deleteOffer(offerId);
    if (result.success) {
      setOffers((prev) => prev.filter((o) => o.id !== offerId));
      toast.success("Oferta usunięta");
    } else {
      toast.error(result.message || "Nie udało się usunąć oferty");
    }
  };

  return (
    <div className="min-h-screen bg-[#E9E8F8]">
      <OffersHeader />
      <Wrapper>
        <main className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-roboto font-medium">Oferty</h2>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchOffers}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Odśwież
              </Button>
              <Button
                size="sm"
                onClick={() => router.push("/offers/create")}
              >
                <Plus className="w-4 h-4 mr-2" />
                Nowa oferta
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-lg p-6 animate-pulse h-48"
                />
              ))}
            </div>
          ) : offers.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg mb-4">
                Nie masz jeszcze żadnych ofert
              </p>
              <Button onClick={() => router.push("/offers/create")}>
                <Plus className="w-4 h-4 mr-2" />
                Utwórz pierwszą ofertę
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {offers.map((offer) => (
                <OfferCard
                  key={offer.id}
                  offer={offer}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </main>
      </Wrapper>
    </div>
  );
};

export default OffersPage;
