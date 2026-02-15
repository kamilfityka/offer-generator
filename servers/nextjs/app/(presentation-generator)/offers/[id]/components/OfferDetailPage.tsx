"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Send,
  Upload,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import Wrapper from "@/components/Wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  OffersApi,
  Offer,
} from "@/app/(presentation-generator)/services/api/offers";
import OffersHeader from "../../components/OffersHeader";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Robocza", color: "bg-gray-200 text-gray-700" },
  generated: { label: "Wygenerowana", color: "bg-blue-100 text-blue-700" },
  sent: { label: "Wysłana do CRM", color: "bg-yellow-100 text-yellow-700" },
  accepted: { label: "Zaakceptowana", color: "bg-green-100 text-green-700" },
  expired: { label: "Wygasła", color: "bg-red-100 text-red-700" },
};

const OfferDetailPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const offerId = params.id as string;

  const [offer, setOffer] = useState<Offer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSendingToCrm, setIsSendingToCrm] = useState(false);
  const [estimatedValue, setEstimatedValue] = useState<string>("");

  const fetchOffer = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await OffersApi.getOffer(offerId);
      setOffer(data);
    } catch {
      toast.error("Nie udalo sie zaladowac oferty");
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
      toast.success("PDF wygenerowany pomyslnie");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nie udalo sie wygenerowac PDF"
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
    } catch {
      toast.error("Nie udalo sie wgrac pliku");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendToCrm = async () => {
    if (!offer) return;
    setIsSendingToCrm(true);
    try {
      const payload: { estimated_value?: number } = {};
      if (estimatedValue) {
        payload.estimated_value = parseFloat(estimatedValue);
      }
      const updated = await OffersApi.sendToCrm(offer.id, payload);
      setOffer(updated);
      toast.success(
        `Oferta wyslana do CRM. Szansa sprzedazy #${updated.crm_opportunity_id || updated.raynet_opportunity_id}`
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nie udalo sie wyslac do CRM"
      );
    } finally {
      setIsSendingToCrm(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!offer) return;
    try {
      const updated = await OffersApi.updateStatus(offer.id, newStatus);
      setOffer(updated);
      toast.success("Status zaktualizowany");
    } catch {
      toast.error("Nie udalo sie zmienic statusu");
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
  const canSendToCrm =
    offer.status === "generated" &&
    offer.document_path &&
    offer.raynet_company_id;

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
            Powrot do listy ofert
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
                  <span className="text-gray-500">Wazna do:</span>{" "}
                  {offer.valid_until}
                </div>
              )}
            </div>

            {/* CRM link info */}
            {offer.raynet_opportunity_id && (
              <div className="mt-3 pt-3 border-t text-sm">
                <span className="text-gray-500">Szansa sprzedazy w CRM:</span>{" "}
                <span className="font-medium text-blue-600">
                  #{offer.raynet_opportunity_id}
                </span>
              </div>
            )}
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
                  ? "Zmien plik opisu"
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

              {/* Manual status transitions (for sent offers) */}
              {offer.status === "sent" && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleStatusChange("accepted")}
                    className="border-green-300 text-green-700 hover:bg-green-50"
                  >
                    Zaakceptowana
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleStatusChange("expired")}
                    className="border-red-300 text-red-700 hover:bg-red-50"
                  >
                    Wygasla
                  </Button>
                </>
              )}
            </div>

            {!offer.description_file_path && (
              <p className="text-xs text-amber-600 mt-3">
                Wgraj plik z opisem oferty (.txt/.md), aby moc wygenerowac PDF.
              </p>
            )}
          </section>

          {/* Send to CRM section */}
          {canSendToCrm && (
            <section className="bg-blue-50 rounded-lg p-6 border border-blue-200 mb-6">
              <h2 className="text-lg font-medium mb-2 text-blue-900">
                Wyslij do Raynet CRM
              </h2>
              <p className="text-sm text-blue-700 mb-4">
                Utworzy szanse sprzedazy, zalaczy PDF oferty i zarejestruje
                aktywnosc w CRM.
              </p>

              <div className="flex items-end gap-3">
                <div>
                  <Label
                    htmlFor="estimated-value"
                    className="text-sm text-blue-800"
                  >
                    Szacowana wartosc (PLN, opcjonalne)
                  </Label>
                  <Input
                    id="estimated-value"
                    type="number"
                    value={estimatedValue}
                    onChange={(e) => setEstimatedValue(e.target.value)}
                    placeholder="np. 12000"
                    className="mt-1 w-48"
                  />
                </div>
                <Button
                  onClick={handleSendToCrm}
                  disabled={isSendingToCrm}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isSendingToCrm ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Wysylanie...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Wyslij do CRM
                    </>
                  )}
                </Button>
              </div>

              {!offer.raynet_company_id && (
                <p className="text-xs text-amber-600 mt-3">
                  Oferta nie ma przypisanego ID firmy z CRM. Wybierz firme z
                  Raynet podczas tworzenia oferty.
                </p>
              )}
            </section>
          )}

          {/* CRM confirmation */}
          {offer.raynet_opportunity_id && (
            <section className="bg-green-50 rounded-lg p-6 border border-green-200 mb-6">
              <h2 className="text-lg font-medium mb-2 text-green-900">
                Wyslano do CRM
              </h2>
              <div className="text-sm text-green-800 space-y-1">
                <p>
                  Szansa sprzedazy:{" "}
                  <strong>#{offer.raynet_opportunity_id}</strong>
                </p>
                <p>PDF oferty i aktywnosc zostaly zarejestrowane w Raynet.</p>
              </div>
            </section>
          )}

          {/* AI generated content preview */}
          {offer.ai_generated_content && (
            <section className="bg-white rounded-lg p-6 border border-gray-200">
              <h2 className="text-lg font-medium mb-4">
                Wygenerowana tresc oferty
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
