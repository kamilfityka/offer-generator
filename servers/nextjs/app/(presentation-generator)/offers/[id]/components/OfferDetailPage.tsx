"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import Wrapper from "@/components/Wrapper";
import { Button } from "@/components/ui/button";
import {
  OffersApi,
  Offer,
} from "@/app/(presentation-generator)/services/api/offers";
import OffersHeader from "../../components/OffersHeader";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Robocza", color: "bg-gray-200 text-gray-700" },
  generated: { label: "Wygenerowana", color: "bg-blue-100 text-blue-700" },
  sent: { label: "Wysłana", color: "bg-yellow-100 text-yellow-700" },
  accepted: { label: "Zaakceptowana", color: "bg-green-100 text-green-700" },
  expired: { label: "Wygasła", color: "bg-red-100 text-red-700" },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["generated"],
  generated: ["sent"],
  sent: ["accepted", "expired"],
  accepted: [],
  expired: [],
};

const OfferDetailPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const offerId = params.id as string;

  const [offer, setOffer] = useState<Offer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const fetchOffer = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await OffersApi.getOffer(offerId);
      setOffer(data);
    } catch {
      toast.error("Nie udało się załadować oferty");
      router.push("/offers");
    } finally {
      setIsLoading(false);
    }
  }, [offerId, router]);

  useEffect(() => {
    if (offerId) fetchOffer();
  }, [offerId, fetchOffer]);

  const handleGeneratePdf = async () => {
    if (!offer) return;
    setIsGenerating(true);
    try {
      const updated = await OffersApi.generatePdf(offer.id);
      setOffer(updated);
      toast.success("PDF wygenerowany pomyślnie");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nie udało się wygenerować PDF"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUploadDescription = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !offer) return;

    const isValid = file.name.endsWith(".txt") || file.name.endsWith(".md");
    if (!isValid) {
      toast.error("Dozwolone formaty: .txt, .md");
      return;
    }

    setIsUploading(true);
    try {
      await OffersApi.uploadDescription(offer.id, file);
      toast.success("Plik wgrany");
      fetchOffer();
    } catch (error) {
      toast.error("Nie udało się wgrać pliku");
    } finally {
      setIsUploading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!offer) return;
    try {
      const updated = await OffersApi.updateStatus(offer.id, newStatus);
      setOffer(updated);
      toast.success("Status zaktualizowany");
    } catch (error) {
      toast.error("Nie udało się zmienić statusu");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#E9E8F8]">
        <OffersHeader />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (!offer) return null;

  const statusInfo = STATUS_LABELS[offer.status] || STATUS_LABELS.draft;
  const nextStatuses = STATUS_TRANSITIONS[offer.status] || [];

  return (
    <div className="min-h-screen bg-[#E9E8F8]">
      <OffersHeader />
      <Wrapper>
        <main className="container mx-auto px-4 py-8 max-w-4xl">
          <Link
            href="/offers"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Powrót do listy ofert
          </Link>

          {/* Title and status */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-roboto font-medium">
                {offer.title}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Utworzono:{" "}
                {new Date(offer.created_at).toLocaleString("pl-PL")}
              </p>
            </div>
            <span
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusInfo.color}`}
            >
              {statusInfo.label}
            </span>
          </div>

          {/* Client info */}
          <section className="bg-white rounded-lg p-6 border border-gray-200 mb-6">
            <h2 className="text-lg font-medium mb-3">Dane klienta (snapshot)</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Firma:</span>{" "}
                <strong>{offer.company_name}</strong>
              </div>
              {offer.company_nip && (
                <div>
                  <span className="text-gray-500">NIP:</span>{" "}
                  {offer.company_nip}
                </div>
              )}
              {offer.company_address && (
                <div className="md:col-span-2">
                  <span className="text-gray-500">Adres:</span>{" "}
                  {offer.company_address}
                </div>
              )}
              {(offer.contact_first_name || offer.contact_last_name) && (
                <div>
                  <span className="text-gray-500">Kontakt:</span>{" "}
                  {offer.contact_first_name} {offer.contact_last_name}
                </div>
              )}
              {offer.contact_email && (
                <div>
                  <span className="text-gray-500">Email:</span>{" "}
                  {offer.contact_email}
                </div>
              )}
              {offer.contact_phone && (
                <div>
                  <span className="text-gray-500">Telefon:</span>{" "}
                  {offer.contact_phone}
                </div>
              )}
              {offer.valid_until && (
                <div>
                  <span className="text-gray-500">Ważna do:</span>{" "}
                  {offer.valid_until}
                </div>
              )}
            </div>
          </section>

          {/* Actions */}
          <section className="bg-white rounded-lg p-6 border border-gray-200 mb-6">
            <h2 className="text-lg font-medium mb-4">Akcje</h2>
            <div className="flex flex-wrap gap-3">
              {/* Upload description */}
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-100 transition-colors text-sm">
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {offer.description_file_path
                  ? "Zmień plik opisu"
                  : "Wgraj plik opisu"}
                <input
                  type="file"
                  accept=".txt,.md"
                  onChange={handleUploadDescription}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>

              {/* Generate PDF */}
              <Button
                onClick={handleGeneratePdf}
                disabled={isGenerating || !offer.description_file_path}
                variant="default"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generowanie...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Generuj PDF (AI)
                  </>
                )}
              </Button>

              {/* Download PDF */}
              {offer.document_path && (
                <a
                  href={OffersApi.getDownloadPdfUrl(offer.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Pobierz PDF
                  </Button>
                </a>
              )}

              {/* Status transitions */}
              {nextStatuses
                .filter((s) => s !== "generated")
                .map((status) => (
                  <Button
                    key={status}
                    variant="outline"
                    onClick={() => handleStatusChange(status)}
                  >
                    {STATUS_LABELS[status]?.label || status}
                  </Button>
                ))}
            </div>

            {!offer.description_file_path && (
              <p className="text-xs text-amber-600 mt-3">
                Wgraj plik z opisem oferty (.txt/.md), aby móc wygenerować PDF.
              </p>
            )}
          </section>

          {/* AI generated content preview */}
          {offer.ai_generated_content && (
            <section className="bg-white rounded-lg p-6 border border-gray-200">
              <h2 className="text-lg font-medium mb-4">
                Wygenerowana treść oferty
              </h2>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: offer.ai_generated_content,
                }}
              />
            </section>
          )}
        </main>
      </Wrapper>
    </div>
  );
};

export default OfferDetailPage;
