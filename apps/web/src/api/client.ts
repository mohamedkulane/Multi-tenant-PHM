import axios from "axios";
import { http } from "./http";

export interface ApiEnvelope<T> {
  data: T;
  requestId?: string;
}

export async function getData<T>(url: string) {
  return (await http.get<ApiEnvelope<T>>(url)).data.data;
}

export async function sendData<T>(
  method: "post" | "put" | "patch" | "delete",
  url: string,
  body?: unknown,
) {
  return (await http.request<ApiEnvelope<T>>({ method, url, data: body })).data.data;
}

export async function removeSession(url: string) {
  await http.post(url);
}

interface ErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: {
      issues?: { path: string; message: string }[];
      fieldErrors?: Record<string, string[]>;
      formErrors?: string[];
    };
  };
  requestId?: string;
}

const fieldLabel = (path: string) =>
  path
    .replace(/\.(\d+)\./g, (_, index: string) => ` ${Number(index) + 1}: `)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.]/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());

/** Safe validation messages also work for nested items (e.g. items.0.quantity). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!axios.isAxiosError(error) || !error.response || error.response.status >= 500) return {};
  const details = (error.response.data as ErrorPayload | undefined)?.error?.details;
  if (details?.issues?.length)
    return Object.fromEntries(details.issues.map((issue) => [issue.path, issue.message]));
  return Object.fromEntries(
    Object.entries(details?.fieldErrors ?? {}).map(([key, messages]) => [key, messages.join(". ")]),
  );
}

export function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return error.code === "ECONNABORTED"
        ? "Codsigu wuu daahay. Hubi internet-ka; haddii aad lacag diiwaangelinaysay, hubi inay kaydsantay ka hor intaadan ku celin."
        : "Server-ka lama xiriiri karo. Hubi internet-ka ama la xiriir maamulka haddii system-ku uusan shaqaynayn.";
    }
    const payload = error.response.data as ErrorPayload | undefined;
    const code = payload?.error?.code ?? "";
    const friendly: Record<string, string> = {
      INVALID_CREDENTIALS: "Organization-ka, username-ka ama password-ka waa khaldan yihiin.",
      INVALID_PLATFORM_CREDENTIALS:
        "Email-ka ama password-ka Platform-ka waa khaldan yahay. Hubi labadaba ama dooro Forgot password.",
      EMAIL_DELIVERY_UNAVAILABLE:
        "Email-diristu weli ma diyaarsana. La xiriir maamulka si SMTP loo dejiyo, kadib mar kale codso link-ga.",
      RECOVERY_LINK_INVALID:
        "Link-gani wuu dhacay, waa la isticmaalay ama ma saxna. Codso email cusub.",
      PLATFORM_EMAIL_EXISTS:
        "Email-kan waxaa hore loogu diiwaangeliyey platform account. Isticmaal email kale.",
      PLAN_LIMIT_EXCEEDED:
        "Xadka plan-ka ayaa la gaaray. La xiriir maamulka si plan-ka loo kordhiyo.",
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
      UNSUPPORTED_PAYMENT_METHOD:
        "Habka lacag-bixinta ma shaqeynayo. Dooro mid ka mid ah hababka maamulka dejiyey.",
      EMAIL_ALREADY_IN_USE: "Email-kan waxaa horay u isticmaala account kale.",
      DUPLICATE_RECORD:
        "Xogtan hore ayay u diiwaangashan tahay. Hubi diiwaanka jira ama isticmaal xog kale.",
      RELATED_RECORD_CONFLICT:
        "Diiwaankan xog kale ayuu ku xiran yahay ama xogta la doortay ma jirto. Refresh samee; diiwaan la isticmaalay archive garee halkii aad tirtiri lahayd.",
      RECORD_NOT_FOUND: "Diiwaankan hadda ma jiro. Refresh samee oo dooro diiwaanka saxda ah.",
      CONCURRENT_MODIFICATION:
        "Qof ama codsi kale ayaa xogtan beddelay. Refresh samee oo hubi xogta cusub ka hor intaadan ku celin.",
    };
    const backendMessage = payload?.error?.message ?? "";
    if (code === "VALIDATION_FAILED") {
      const fields = Object.entries(fieldErrors(error)).map(
        ([path, message]) => `${fieldLabel(path) || "Form"}: ${message}`,
      );
      const formErrors = payload?.error?.details?.formErrors ?? [];
      if (fields.length || formErrors.length) return [...fields, ...formErrors].join(" · ");
    }
    if (code === "TENANT_SUBSCRIPTION_EXPIRED" && backendMessage) return backendMessage;
    if (friendly[code]) return friendly[code];
    if (code === "INTERNAL_ERROR" || (error.response.status ?? 500) >= 500) {
      return `Server-ka ayaa cilad la kulmay. Haddii lacag la diiwaangelinayay, hubi inay kaydsantay ka hor intaadan ku celin. La xiriir maamulka${payload?.requestId ? `; lambarka qaladka: ${payload.requestId}` : "."}`;
    }
    if (error.response.status === 429)
      return "Codsiyo badan ayaa la diray. Sug dhowr daqiiqo kadib isku day mar kale.";
    if (error.response.status === 401)
      return "Session-kaagu wuu dhammaaday. Fadlan mar kale soo gal system-ka.";
    // The API only exposes deliberate AppError messages for 4xx responses; never expose 5xx details.
    if (backendMessage && /^[A-Z][A-Z0-9_]+$/.test(code)) return backendMessage;
    if (error.response.status === 404) return "Xogta la raadinayey lama helin.";
    if (error.response.status === 403) return "Akoonkaagu fasax uma laha hawshan.";
    if (error.response.status === 409)
      return "Xogtan waxay isku dhacday xog hore. Refresh samee oo mar kale isku day.";
    return "Codsigan lama aqbalin. Hubi xogta form-ka, kadib isku day mar kale.";
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
