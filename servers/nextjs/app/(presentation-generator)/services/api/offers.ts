import { getHeader, getHeaderForFormData } from "@/app/(presentation-generator)/services/api/header";
import { ApiResponseHandler } from "@/app/(presentation-generator)/services/api/api-error-handler";

export interface CrmCompany {
  id: string;
  raynet_id: string;
  name: string;
  nip: string | null;
  address: string | null;
}

export interface CrmContact {
  id: string;
  raynet_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

export interface Offer {
  id: string;
  company_name: string;
  company_nip: string | null;
  company_address: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  title: string;
  valid_until: string | null;
  description_file_path: string | null;
  status: string;
  document_path: string | null;
  ai_generated_content: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateOfferPayload {
  company_name: string;
  company_nip?: string;
  company_address?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  contact_phone?: string;
  contact_email?: string;
  title: string;
  valid_until?: string;
}

export class OffersApi {
  // CRM endpoints
  static async getCompanies(): Promise<CrmCompany[]> {
    try {
      const response = await fetch("/api/v1/crm/companies", { method: "GET" });
      if (response.status === 404) return [];
      return await ApiResponseHandler.handleResponse(response, "Failed to fetch companies");
    } catch (error) {
      console.error("Error fetching companies:", error);
      throw error;
    }
  }

  static async getCompanyContacts(companyId: string): Promise<CrmContact[]> {
    try {
      const response = await fetch(`/api/v1/crm/companies/${companyId}/contacts`, {
        method: "GET",
      });
      if (response.status === 404) return [];
      return await ApiResponseHandler.handleResponse(response, "Failed to fetch contacts");
    } catch (error) {
      console.error("Error fetching contacts:", error);
      throw error;
    }
  }

  static async syncCrm(): Promise<{ synced_companies: number; synced_contacts: number }> {
    try {
      const response = await fetch("/api/v1/crm/sync", {
        method: "POST",
        headers: getHeader(),
      });
      return await ApiResponseHandler.handleResponse(response, "Failed to sync CRM data");
    } catch (error) {
      console.error("Error syncing CRM:", error);
      throw error;
    }
  }

  // Offers endpoints
  static async createOffer(payload: CreateOfferPayload): Promise<Offer> {
    try {
      const response = await fetch("/api/v1/offers", {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify(payload),
      });
      return await ApiResponseHandler.handleResponse(response, "Failed to create offer");
    } catch (error) {
      console.error("Error creating offer:", error);
      throw error;
    }
  }

  static async getOffers(): Promise<Offer[]> {
    try {
      const response = await fetch("/api/v1/offers", { method: "GET" });
      if (response.status === 404) return [];
      return await ApiResponseHandler.handleResponse(response, "Failed to fetch offers");
    } catch (error) {
      console.error("Error fetching offers:", error);
      throw error;
    }
  }

  static async getOffer(offerId: string): Promise<Offer> {
    try {
      const response = await fetch(`/api/v1/offers/${offerId}`, { method: "GET" });
      return await ApiResponseHandler.handleResponse(response, "Offer not found");
    } catch (error) {
      console.error("Error fetching offer:", error);
      throw error;
    }
  }

  static async uploadDescription(offerId: string, file: File): Promise<any> {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/v1/offers/${offerId}/upload-description`, {
        method: "POST",
        headers: getHeaderForFormData(),
        body: formData,
      });
      return await ApiResponseHandler.handleResponse(response, "Failed to upload description");
    } catch (error) {
      console.error("Error uploading description:", error);
      throw error;
    }
  }

  static async generatePdf(offerId: string): Promise<Offer> {
    try {
      const response = await fetch(`/api/v1/offers/${offerId}/generate-pdf`, {
        method: "POST",
        headers: getHeader(),
      });
      return await ApiResponseHandler.handleResponse(response, "Failed to generate PDF");
    } catch (error) {
      console.error("Error generating PDF:", error);
      throw error;
    }
  }

  static async updateStatus(offerId: string, status: string): Promise<Offer> {
    try {
      const response = await fetch(`/api/v1/offers/${offerId}/status`, {
        method: "PATCH",
        headers: getHeader(),
        body: JSON.stringify({ status }),
      });
      return await ApiResponseHandler.handleResponse(response, "Failed to update status");
    } catch (error) {
      console.error("Error updating status:", error);
      throw error;
    }
  }

  static async deleteOffer(offerId: string): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await fetch(`/api/v1/offers/${offerId}`, {
        method: "DELETE",
        headers: getHeader(),
      });
      return await ApiResponseHandler.handleResponseWithResult(response, "Failed to delete offer");
    } catch (error) {
      console.error("Error deleting offer:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to delete offer",
      };
    }
  }

  static getDownloadPdfUrl(offerId: string): string {
    return `/api/v1/offers/${offerId}/download-pdf`;
  }
}
