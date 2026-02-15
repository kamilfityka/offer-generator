"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import Wrapper from "@/components/Wrapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  OffersApi,
  CrmCompany,
  CrmContact,
} from "@/app/(presentation-generator)/services/api/offers";
import OffersHeader from "../../components/OffersHeader";

const CreateOfferPage: React.FC = () => {
  const router = useRouter();

  // CRM data
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [selectedContactId, setSelectedContactId] = useState<string>("");

  // Raynet IDs (for CRM write-back)
  const [raynetCompanyId, setRaynetCompanyId] = useState<string>("");
  const [raynetContactId, setRaynetContactId] = useState<string>("");

  // Form state
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyNip, setCompanyNip] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [descriptionFile, setDescriptionFile] = useState<File | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load companies on mount
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const data = await OffersApi.getCompanies();
        setCompanies(data);
      } catch {
        // Companies may not be synced yet, that's fine
      }
    };
    loadCompanies();
  }, []);

  // Load contacts when company changes
  useEffect(() => {
    if (!selectedCompanyId) {
      setContacts([]);
      return;
    }
    const loadContacts = async () => {
      try {
        const data = await OffersApi.getCompanyContacts(selectedCompanyId);
        setContacts(data);
      } catch {
        setContacts([]);
      }
    };
    loadContacts();
  }, [selectedCompanyId]);

  const handleCompanySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const companyId = e.target.value;
    setSelectedCompanyId(companyId);
    setSelectedContactId("");

    const company = companies.find((c) => c.id === companyId);
    if (company) {
      setCompanyName(company.name);
      setCompanyNip(company.nip || "");
      setCompanyAddress(company.address || "");
      setRaynetCompanyId(company.raynet_id);
    } else {
      setRaynetCompanyId("");
    }
  };

  const handleContactSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const contactId = e.target.value;
    setSelectedContactId(contactId);

    const contact = contacts.find((c) => c.id === contactId);
    if (contact) {
      setContactFirstName(contact.first_name || "");
      setContactLastName(contact.last_name || "");
      setContactPhone(contact.phone || "");
      setContactEmail(contact.email || "");
      setRaynetContactId(contact.raynet_id);
    } else {
      setRaynetContactId("");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const isValid =
        file.name.endsWith(".txt") || file.name.endsWith(".md");
      if (!isValid) {
        toast.error("Dozwolone formaty: .txt, .md");
        return;
      }
      setDescriptionFile(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyName.trim()) {
      toast.error("Nazwa firmy jest wymagana");
      return;
    }
    if (!title.trim()) {
      toast.error("Tytuł oferty jest wymagany");
      return;
    }

    setIsSubmitting(true);
    try {
      // Step 1: Create offer
      const offer = await OffersApi.createOffer({
        raynet_company_id: raynetCompanyId || undefined,
        raynet_contact_id: raynetContactId || undefined,
        company_name: companyName,
        company_nip: companyNip || undefined,
        company_address: companyAddress || undefined,
        contact_first_name: contactFirstName || undefined,
        contact_last_name: contactLastName || undefined,
        contact_phone: contactPhone || undefined,
        contact_email: contactEmail || undefined,
        title,
        valid_until: validUntil || undefined,
      });

      // Step 2: Upload description file if provided
      if (descriptionFile) {
        await OffersApi.uploadDescription(offer.id, descriptionFile);
      }

      toast.success("Oferta utworzona");
      router.push(`/offers/${offer.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nie udało się utworzyć oferty"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E9E8F8]">
      <OffersHeader />
      <Wrapper>
        <main className="container mx-auto px-4 py-8 max-w-3xl">
          <Link
            href="/offers"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Powrót do listy ofert
          </Link>

          <h1 className="text-2xl font-roboto font-medium mb-6">
            Nowa oferta
          </h1>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Company selection from CRM */}
            {companies.length > 0 && (
              <section className="bg-white rounded-lg p-6 border border-gray-200">
                <h2 className="text-lg font-medium mb-4">
                  Wybierz klienta z CRM
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="crm-company">Firma</Label>
                    <select
                      id="crm-company"
                      value={selectedCompanyId}
                      onChange={handleCompanySelect}
                      className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Wybierz firmę --</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.nip ? ` (NIP: ${c.nip})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {contacts.length > 0 && (
                    <div>
                      <Label htmlFor="crm-contact">Osoba kontaktowa</Label>
                      <select
                        id="crm-contact"
                        value={selectedContactId}
                        onChange={handleContactSelect}
                        className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">-- Wybierz kontakt --</option>
                        {contacts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.first_name} {c.last_name}
                            {c.email ? ` (${c.email})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Client data (snapshot) */}
            <section className="bg-white rounded-lg p-6 border border-gray-200">
              <h2 className="text-lg font-medium mb-4">Dane klienta</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="company-name">Nazwa firmy *</Label>
                  <Input
                    id="company-name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Nazwa firmy"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="company-nip">NIP</Label>
                  <Input
                    id="company-nip"
                    value={companyNip}
                    onChange={(e) => setCompanyNip(e.target.value)}
                    placeholder="NIP"
                    className="mt-1"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="company-address">Adres</Label>
                  <Input
                    id="company-address"
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    placeholder="Adres firmy"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label htmlFor="contact-first-name">Imię kontaktu</Label>
                  <Input
                    id="contact-first-name"
                    value={contactFirstName}
                    onChange={(e) => setContactFirstName(e.target.value)}
                    placeholder="Imię"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-last-name">Nazwisko kontaktu</Label>
                  <Input
                    id="contact-last-name"
                    value={contactLastName}
                    onChange={(e) => setContactLastName(e.target.value)}
                    placeholder="Nazwisko"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-phone">Telefon</Label>
                  <Input
                    id="contact-phone"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="Telefon"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-email">Email</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="Email"
                    className="mt-1"
                  />
                </div>
              </div>
            </section>

            {/* Offer details */}
            <section className="bg-white rounded-lg p-6 border border-gray-200">
              <h2 className="text-lg font-medium mb-4">Dane oferty</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Tytuł oferty *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Np. Oferta na wdrożenie systemu CRM"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="valid-until">Data ważności</Label>
                  <Input
                    id="valid-until"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="description-file">
                    Plik z opisem oferty (.txt / .md)
                  </Label>
                  <div className="mt-1 flex items-center gap-3">
                    <label className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-300 rounded-md cursor-pointer hover:bg-gray-100 transition-colors text-sm">
                      <Upload className="w-4 h-4" />
                      {descriptionFile
                        ? descriptionFile.name
                        : "Wybierz plik"}
                      <input
                        id="description-file"
                        type="file"
                        accept=".txt,.md"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                    {descriptionFile && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDescriptionFile(null)}
                        className="text-red-500"
                      >
                        Usuń
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Plik będzie stanowił podstawę do wygenerowania treści oferty
                    przez AI.
                  </p>
                </div>
              </div>
            </section>

            {/* Submit */}
            <div className="flex justify-end gap-3">
              <Link href="/offers">
                <Button type="button" variant="outline">
                  Anuluj
                </Button>
              </Link>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Tworzenie...
                  </>
                ) : (
                  "Utwórz ofertę"
                )}
              </Button>
            </div>
          </form>
        </main>
      </Wrapper>
    </div>
  );
};

export default CreateOfferPage;
