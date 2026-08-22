import axios from "axios";
import { http } from "./http";

export interface ApiEnvelope<T> {
  data: T;
  requestId?: string;
}

export async function getData<T>(url: string) {
  return (await http.get<ApiEnvelope<T>>(url)).data.data;
}

export async function sendData<T>(method: "post" | "put" | "patch", url: string, body?: unknown) {
  return (await http.request<ApiEnvelope<T>>({ method, url, data: body })).data.data;
}

export async function removeSession(url: string) {
  await http.post(url);
}

export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return "Server-ka lama xiriiri karo. Hubi in API-gu shaqeynayo kadibna isku day mar kale.";
    }
    const payload = error.response.data as
      { error?: { code?: string; message?: string }; requestId?: string } | undefined;
    const code = payload?.error?.code ?? "";
    const friendly: Record<string, string> = {
      INVALID_CREDENTIALS: "Organization-ka, username-ka ama password-ka waa khaldan yihiin.",
      PERMISSION_DENIED: "Akoonkaagu fasax uma laha hawshan.",
      BRANCH_ACCESS_DENIED: "Waxaad ka shaqeyn kartaa oo keliya branch-ka laguu qoondeeyey.",
      LAB_DISCOUNT_EXCEEDS_SUBTOTAL: "Discount-ku kama badnaan karo qiimaha baaritaannada.",
      LAB_PAYMENT_EXCEEDS_TOTAL: "Lacagta la bixiyey kama badnaan karto total-ka baaritaanka.",
      LAB_PAYMENT_EXCEEDS_BALANCE: "Lacagta la geliyey kama badnaan karto balance-ka harsan.",
      LAB_PAYMENT_METHOD_REQUIRED: "Dooro habka lacag-bixinta.",
      LAB_PAY_NOW_REQUIRES_FULL_PAYMENT:
        "Pay now wuxuu u baahan yahay in total-ka baaritaanka oo dhan la bixiyo.",
      LAB_PAY_LATER_REQUIRES_ZERO_PAYMENT:
        "Pay later dooro adigoon lacag gelin; lacagta waxaa lagu dari karaa marka natiijada la qaadanayo.",
      INVALID_LAB_TESTS: "Dooro ugu yaraan hal baaritaan oo shaqeynaya.",
      EXPIRED_STOCK_TRANSFER: "Daawo dhacday branch kale looma wareejin karo.",
      EXPIRED_STOCK_TRANSFER_DENIED: "Daawo dhacday branch kale looma wareejin karo.",
      ROUTE_NOT_FOUND: "Hawshan hadda lama heli karo. Fadlan refresh samee oo mar kale isku day.",
      VALIDATION_FAILED: "Xogta la geliyey ma saxna. Hubi meelaha form-ka oo mar kale isku day.",
      CURRENT_PASSWORD_INCORRECT: "Password-ka hadda aad isticmaasho waa khalad.",
      PASSWORD_UNCHANGED: "Password-ka cusub waa inuu ka duwanaadaa kii hore.",
      EMAIL_ALREADY_IN_USE: "Email-kan waxaa horay u isticmaala account kale.",
    };
    const backendMessage = payload?.error?.message ?? "";
    if (code === "TENANT_SUBSCRIPTION_EXPIRED" && backendMessage) return backendMessage;
    if (friendly[code]) return friendly[code];
    if (code === "INTERNAL_ERROR" || (error.response.status ?? 500) >= 500) {
      return "Hawshu ma dhammaan. Fadlan isku day mar kale; haddii ay sii socoto la xiriir maamulka system-ka.";
    }
    if (error.response.status === 404) return "Xogta la raadinayey lama helin.";
    if (error.response.status === 403) return "Akoonkaagu fasax uma laha hawshan.";
    if (error.response.status === 409)
      return "Xogtan waxay isku dhacday xog hore. Refresh samee oo mar kale isku day.";
    return "Hawshu ma dhammaan. Hubi xogta aad gelisay oo mar kale isku day.";
  }
  return error instanceof Error && !error.message.includes("Prisma")
    ? error.message
    : "Waxbaa qaldamay. Fadlan isku day mar kale.";
}

export async function downloadFile(url: string, filename: string) {
  const response = await http.get<Blob>(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
