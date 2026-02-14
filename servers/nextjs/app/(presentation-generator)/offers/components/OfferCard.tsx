"use client";

import React from "react";
import Link from "next/link";
import { Trash2, Eye, Download, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Offer } from "@/app/(presentation-generator)/services/api/offers";
import { OffersApi } from "@/app/(presentation-generator)/services/api/offers";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Robocza", color: "bg-gray-200 text-gray-700" },
  generated: { label: "Wygenerowana", color: "bg-blue-100 text-blue-700" },
  sent: { label: "Wysłana", color: "bg-yellow-100 text-yellow-700" },
  accepted: { label: "Zaakceptowana", color: "bg-green-100 text-green-700" },
  expired: { label: "Wygasła", color: "bg-red-100 text-red-700" },
};

interface OfferCardProps {
  offer: Offer;
  onDelete: (id: string) => void;
}

const OfferCard: React.FC<OfferCardProps> = ({ offer, onDelete }) => {
  const statusInfo = STATUS_LABELS[offer.status] || STATUS_LABELS.draft;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <Link
            href={`/offers/${offer.id}`}
            className="text-lg font-medium text-gray-900 hover:text-blue-600 truncate block"
          >
            {offer.title}
          </Link>
          <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
            <Building2 className="w-3.5 h-3.5" />
            <span className="truncate">{offer.company_name}</span>
          </div>
        </div>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusInfo.color}`}
        >
          {statusInfo.label}
        </span>
      </div>

      {offer.contact_first_name && (
        <p className="text-sm text-gray-500 mb-1">
          Kontakt: {offer.contact_first_name} {offer.contact_last_name}
        </p>
      )}

      {offer.valid_until && (
        <p className="text-sm text-gray-400 mb-3">
          Ważna do: {offer.valid_until}
        </p>
      )}

      <div className="text-xs text-gray-400 mb-4">
        Utworzono: {new Date(offer.created_at).toLocaleDateString("pl-PL")}
      </div>

      <div className="flex items-center gap-2 border-t pt-3">
        <Link href={`/offers/${offer.id}`}>
          <Button variant="ghost" size="sm">
            <Eye className="w-4 h-4 mr-1" />
            Podgląd
          </Button>
        </Link>

        {offer.document_path && (
          <a
            href={OffersApi.getDownloadPdfUrl(offer.id)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" size="sm">
              <Download className="w-4 h-4 mr-1" />
              PDF
            </Button>
          </a>
        )}

        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 hover:text-red-700 hover:bg-red-50"
            onClick={() => onDelete(offer.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OfferCard;
