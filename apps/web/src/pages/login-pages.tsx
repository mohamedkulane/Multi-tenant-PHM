import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { errorMessage, sendData } from "../api/client";
import { showToast } from "../components/toast";
import { platformDashboardPath, tenantLandingPath } from "../lib/auth-navigation";
import { Link, navigate } from "../lib/navigation";
import type { PlatformPrincipal, TenantPrincipal } from "../types";

type SlideId = "clinic" | "laboratory" | "pharmacy";

const slides: Array<{
  id: SlideId;
  eyebrow: string;
  title: string;
  description: string;
}> = [
  {
    id: "clinic",
    eyebrow: "CLINICAL CARE",
    title: "Better patient care.",
    description:
      "Manage registration, consultations, examinations and patient visits through one connected clinical workflow.",
  },
  {
    id: "laboratory",
    eyebrow: "SMART LABORATORY",
    title: "From request to result.",
    description:
      "Receive laboratory orders, collect samples, perform tests and return results to doctors without losing the patient journey.",
  },
  {
    id: "pharmacy",
    eyebrow: "PHARMACY OPERATIONS",
    title: "Stock and sales in control.",
    description:
      "Manage medicines, batches, inventory and daily pharmacy sales with clear operational visibility.",
  },
];

function NidwaLogo() {
  return (
    <div className="flex items-center gap-4">
      <svg width="58" height="54" viewBox="0 0 58 54" fill="none" aria-hidden="true">
        <defs>
          <linearGradient
            id="nidwa-gradient"
            x1="3"
            y1="3"
            x2="54"
            y2="52"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#9CF1FF" />
            <stop offset="0.5" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#B7DFFF" />
          </linearGradient>
        </defs>
        <path
          d="M7 43L19 10C20.5 6 25.8 5.4 28.1 8.7L45.5 33.2L51 17.7"
          stroke="url(#nidwa-gradient)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div>
        <div className="text-[27px] font-bold leading-none tracking-tight text-white">
          Nidwa ICT
        </div>
        <div className="mt-2 text-[9px] font-bold tracking-[0.38em] text-blue-100 uppercase">
          Healthcare Solutions
        </div>
      </div>
    </div>
  );
}

function ClinicIllustration() {
  return (
    <svg
      viewBox="0 0 620 430"
      className="h-auto w-full max-w-[540px]"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="clinic-bg" x1="72" y1="38" x2="520" y2="390">
          <stop stopColor="#5BCBFF" />
          <stop offset="1" stopColor="#1476E7" />
        </linearGradient>
        <linearGradient id="clinic-shirt" x1="290" y1="207" x2="290" y2="388">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#D8EDFF" />
        </linearGradient>
        <filter id="clinic-shadow">
          <feDropShadow dx="0" dy="15" stdDeviation="13" floodColor="#0450A4" floodOpacity="0.28" />
        </filter>
      </defs>

      <motion.circle
        cx="310"
        cy="216"
        r="174"
        fill="url(#clinic-bg)"
        opacity="0.38"
        animate={{ r: [168, 178, 168], opacity: [0.3, 0.42, 0.3] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* doctor card */}
      <motion.g
        filter="url(#clinic-shadow)"
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 4.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect x="188" y="58" width="250" height="314" rx="24" fill="#F8FCFF" />
        <rect x="188" y="58" width="250" height="67" rx="24" fill="#DFF2FF" />
        <circle cx="230" cy="91" r="13" fill="#1F83EE" />
        <rect x="257" y="80" width="115" height="10" rx="5" fill="#86C6FF" />
        <rect x="257" y="101" width="75" height="8" rx="4" fill="#B8DCF9" />

        {/* doctor head */}
        <circle cx="307" cy="182" r="49" fill="#FFD8BD" />
        <path
          d="M261 177C261 139 283 119 311 119C342 119 363 142 358 179C344 163 332 155 310 157C291 159 277 166 261 177Z"
          fill="#163D70"
        />
        <circle cx="289" cy="181" r="4" fill="#284765" />
        <circle cx="327" cy="181" r="4" fill="#284765" />
        <path
          d="M298 202C306 209 315 209 323 202"
          stroke="#B56758"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* coat */}
        <path
          d="M237 352C240 278 266 231 308 231C350 231 378 278 382 352H237Z"
          fill="url(#clinic-shirt)"
        />
        <path
          d="M286 236L308 268L330 236"
          stroke="#79B9EF"
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path d="M308 268V352" stroke="#B4D8F6" strokeWidth="4" />
        <rect x="329" y="288" width="35" height="28" rx="5" fill="#C9E6FB" />
        <path d="M338 295V309M331 302H345" stroke="#1679E6" strokeWidth="3" strokeLinecap="round" />

        {/* stethoscope */}
        <path
          d="M276 246V292C276 322 305 331 321 309"
          stroke="#173F73"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="M263 246V225M289 246V225" stroke="#173F73" strokeWidth="6" strokeLinecap="round" />
        <circle cx="329" cy="303" r="15" fill="#FFFFFF" stroke="#173F73" strokeWidth="6" />
        <circle cx="329" cy="303" r="5" fill="#4DD8EF" />
      </motion.g>

      {/* patient mini card */}
      <motion.g
        filter="url(#clinic-shadow)"
        initial={{ opacity: 0, x: -35 }}
        animate={{ opacity: 1, x: 0, y: [0, 5, 0] }}
        transition={{
          opacity: { duration: 0.5 },
          x: { duration: 0.5 },
          y: { duration: 3.6, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <rect x="65" y="236" width="156" height="110" rx="18" fill="#FFFFFF" />
        <circle cx="104" cy="273" r="21" fill="#D9EEFF" />
        <circle cx="104" cy="266" r="9" fill="#2588EE" />
        <path d="M90 290C92 276 116 276 119 290" fill="#2588EE" />
        <rect x="136" y="258" width="56" height="8" rx="4" fill="#94C8F6" />
        <rect x="136" y="278" width="43" height="7" rx="3.5" fill="#D0E5F8" />
        <rect x="91" y="315" width="101" height="7" rx="3.5" fill="#E1EEF9" />
      </motion.g>

      {/* heartbeat badge */}
      <motion.g
        filter="url(#clinic-shadow)"
        animate={{ scale: [1, 1.07, 1], y: [0, -5, 0] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "500px 290px" }}
      >
        <rect x="438" y="240" width="127" height="98" rx="20" fill="#0755B2" />
        <motion.path
          d="M457 289H476L486 270L498 309L513 256L526 291H547"
          stroke="#75F1FF"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0.1 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, repeat: Infinity, repeatType: "reverse" }}
        />
      </motion.g>

      <motion.g
        animate={{ rotate: [0, 8, 0], y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity }}
        style={{ transformOrigin: "492px 104px" }}
      >
        <circle cx="492" cy="104" r="36" fill="#FFFFFF" opacity="0.18" />
        <path d="M492 87V121M475 104H509" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" />
      </motion.g>
    </svg>
  );
}

function LaboratoryIllustration() {
  return (
    <svg
      viewBox="0 0 620 430"
      className="h-auto w-full max-w-[540px]"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lab-bg" x1="80" y1="50" x2="545" y2="370">
          <stop stopColor="#69E0F6" />
          <stop offset="1" stopColor="#1576E8" />
        </linearGradient>
        <linearGradient id="lab-liquid-a" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#79F0FF" />
          <stop offset="1" stopColor="#2DB4FF" />
        </linearGradient>
        <linearGradient id="lab-liquid-b" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#B8FFEF" />
          <stop offset="1" stopColor="#45DBD6" />
        </linearGradient>
        <filter id="lab-shadow">
          <feDropShadow dx="0" dy="15" stdDeviation="13" floodColor="#0450A4" floodOpacity="0.27" />
        </filter>
      </defs>

      <motion.circle
        cx="315"
        cy="215"
        r="180"
        fill="url(#lab-bg)"
        opacity="0.32"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 5, repeat: Infinity }}
      />

      {/* lab scientist */}
      <motion.g
        filter="url(#lab-shadow)"
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect x="79" y="92" width="220" height="258" rx="24" fill="#F9FDFF" />
        <rect x="79" y="92" width="220" height="58" rx="24" fill="#E2F4FF" />
        <rect x="105" y="111" width="100" height="10" rx="5" fill="#8FCBFA" />
        <rect x="105" y="130" width="70" height="7" rx="3.5" fill="#C8E3F8" />

        <circle cx="188" cy="199" r="42" fill="#FFD9BF" />
        <path
          d="M148 194C150 160 169 145 190 145C220 145 234 167 228 196C215 182 202 177 185 179C171 180 160 185 148 194Z"
          fill="#153F72"
        />

        <path d="M123 334C130 266 153 234 188 234C226 234 251 268 257 334H123Z" fill="#EAF6FF" />
        <path d="M166 241L188 271L210 241" stroke="#7DBCEB" strokeWidth="5" />
        <path d="M188 271V334" stroke="#B7D9F3" strokeWidth="4" />

        <rect x="204" y="278" width="33" height="27" rx="5" fill="#CBE8FA" />
        <path
          d="M213 285V298M207 291.5H219"
          stroke="#177DE9"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </motion.g>

      {/* microscope */}
      <motion.g
        filter="url(#lab-shadow)"
        animate={{ rotate: [0, -2, 0], y: [0, 4, 0] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "420px 215px" }}
      >
        <path d="M385 99L438 133" stroke="#DFF5FF" strokeWidth="18" strokeLinecap="round" />
        <path d="M429 126L400 183" stroke="#0A4D9D" strokeWidth="15" strokeLinecap="round" />
        <path
          d="M396 176C421 175 445 187 451 215"
          stroke="#DCEFFF"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <rect x="362" y="208" width="130" height="18" rx="9" fill="#BEE5FB" />
        <path
          d="M438 220C438 259 415 278 382 278"
          stroke="#0B56AA"
          strokeWidth="15"
          strokeLinecap="round"
        />
        <rect x="351" y="273" width="152" height="24" rx="12" fill="#E9F7FF" />
        <rect x="376" y="296" width="109" height="21" rx="10.5" fill="#9ED7F7" />
        <circle cx="383" cy="215" r="13" fill="#37D7E8" />
      </motion.g>

      {/* test tube rack */}
      <motion.g
        filter="url(#lab-shadow)"
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: [0, -7, 0] }}
        transition={{
          opacity: { duration: 0.5 },
          y: { duration: 3.4, repeat: Infinity, ease: "easeInOut" },
        }}
      >
        <rect x="307" y="318" width="222" height="28" rx="10" fill="#EAF7FF" />
        <rect x="324" y="301" width="189" height="17" rx="8.5" fill="#BCE3F8" />

        <path d="M343 213V307" stroke="#E9FAFF" strokeWidth="18" strokeLinecap="round" />
        <path d="M389 213V307" stroke="#E9FAFF" strokeWidth="18" strokeLinecap="round" />
        <path d="M435 213V307" stroke="#E9FAFF" strokeWidth="18" strokeLinecap="round" />
        <path d="M481 213V307" stroke="#E9FAFF" strokeWidth="18" strokeLinecap="round" />

        <path d="M334 265H352V307H334Z" fill="url(#lab-liquid-a)" />
        <path d="M380 246H398V307H380Z" fill="url(#lab-liquid-b)" />
        <path d="M426 275H444V307H426Z" fill="#7EC8FF" />
        <path d="M472 255H490V307H472Z" fill="#4FDDE2" />

        {[343, 389, 435, 481].map((cx, i) => (
          <motion.circle
            key={cx}
            cx={cx}
            cy={i % 2 === 0 ? 255 : 238}
            r="5"
            fill="#FFFFFF"
            opacity="0.8"
            animate={{ cy: [i % 2 === 0 ? 255 : 238, i % 2 === 0 ? 235 : 218] }}
            transition={{ duration: 2 + i * 0.2, repeat: Infinity, ease: "easeOut" }}
          />
        ))}
      </motion.g>

      {/* result badge */}
      <motion.g
        filter="url(#lab-shadow)"
        animate={{ scale: [1, 1.06, 1], y: [0, -4, 0] }}
        transition={{ duration: 3, repeat: Infinity }}
        style={{ transformOrigin: "514px 91px" }}
      >
        <rect x="458" y="52" width="112" height="79" rx="18" fill="#FFFFFF" />
        <circle cx="486" cy="91" r="18" fill="#D9F8EE" />
        <path
          d="M477 91L484 98L496 83"
          stroke="#28B780"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="514" y="76" width="35" height="7" rx="3.5" fill="#94CAF5" />
        <rect x="514" y="94" width="26" height="6" rx="3" fill="#D2E6F8" />
      </motion.g>
    </svg>
  );
}

function PharmacyIllustration() {
  return (
    <svg
      viewBox="0 0 620 430"
      className="h-auto w-full max-w-[540px]"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ph-bg" x1="72" y1="44" x2="550" y2="390">
          <stop stopColor="#6ADAF8" />
          <stop offset="1" stopColor="#1474E4" />
        </linearGradient>
        <linearGradient id="bottle-blue" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DDEFFF" />
        </linearGradient>
        <filter id="ph-shadow">
          <feDropShadow dx="0" dy="15" stdDeviation="13" floodColor="#0450A4" floodOpacity="0.27" />
        </filter>
      </defs>

      <motion.circle
        cx="310"
        cy="215"
        r="180"
        fill="url(#ph-bg)"
        opacity="0.32"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 5, repeat: Infinity }}
      />

      {/* pharmacy counter */}
      <motion.g
        filter="url(#ph-shadow)"
        animate={{ y: [0, 4, 0] }}
        transition={{ duration: 4.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect x="83" y="105" width="285" height="231" rx="24" fill="#F9FDFF" />
        <rect x="83" y="105" width="285" height="55" rx="24" fill="#E2F3FF" />
        <path d="M116 133H202" stroke="#8BC8F7" strokeWidth="10" strokeLinecap="round" />
        <path d="M322 119V147M308 133H336" stroke="#1680EC" strokeWidth="6" strokeLinecap="round" />

        {/* shelves */}
        <rect x="113" y="187" width="225" height="12" rx="6" fill="#B7DDF7" />
        <rect x="113" y="258" width="225" height="12" rx="6" fill="#B7DDF7" />

        {/* boxes */}
        <rect x="125" y="163" width="48" height="24" rx="5" fill="#93D7F8" />
        <rect x="180" y="169" width="44" height="18" rx="4" fill="#C6ECF7" />
        <rect x="232" y="158" width="53" height="29" rx="5" fill="#79C4FA" />
        <rect x="292" y="166" width="32" height="21" rx="4" fill="#CBE8FA" />

        {/* bottles lower shelf */}
        <rect x="129" y="213" width="37" height="45" rx="7" fill="url(#bottle-blue)" />
        <rect x="136" y="203" width="23" height="13" rx="4" fill="#8CCBF7" />
        <rect x="180" y="222" width="39" height="36" rx="7" fill="#EAF7FF" />
        <rect x="187" y="211" width="25" height="13" rx="4" fill="#76C6F5" />
        <rect x="239" y="208" width="43" height="50" rx="7" fill="#F4FBFF" />
        <rect x="247" y="196" width="27" height="14" rx="4" fill="#98D2F7" />
        <rect x="297" y="217" width="31" height="41" rx="7" fill="#DFF2FF" />

        <rect x="119" y="289" width="116" height="25" rx="8" fill="#D7EDF9" />
        <rect x="247" y="289" width="84" height="25" rx="8" fill="#B5DDF8" />
      </motion.g>

      {/* pharmacist avatar */}
      <motion.g
        filter="url(#ph-shadow)"
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <circle cx="444" cy="176" r="49" fill="#FFD8BD" />
        <path
          d="M400 172C402 137 419 119 444 119C472 119 489 140 487 173C472 159 459 154 441 156C425 158 414 164 400 172Z"
          fill="#173E70"
        />
        <path d="M373 349C379 271 405 225 444 225C484 225 511 271 517 349H373Z" fill="#F3FAFF" />
        <path d="M421 232L444 263L467 232" stroke="#78B8E9" strokeWidth="5" />
        <rect x="461" y="280" width="35" height="28" rx="5" fill="#D0E9FA" />
        <path d="M470 287V301M463 294H477" stroke="#157DE8" strokeWidth="3" strokeLinecap="round" />
      </motion.g>

      {/* floating medicine bottle */}
      <motion.g
        filter="url(#ph-shadow)"
        initial={{ opacity: 0, x: 25 }}
        animate={{ opacity: 1, x: 0, y: [0, -10, 0], rotate: [0, 3, 0] }}
        transition={{
          opacity: { duration: 0.5 },
          x: { duration: 0.5 },
          y: { duration: 3.2, repeat: Infinity },
          rotate: { duration: 3.2, repeat: Infinity },
        }}
        style={{ transformOrigin: "507px 89px" }}
      >
        <rect x="480" y="62" width="54" height="71" rx="10" fill="#FFFFFF" />
        <rect x="489" y="48" width="36" height="18" rx="5" fill="#8FD0F8" />
        <rect x="489" y="88" width="36" height="16" rx="5" fill="#B7E1F8" />
      </motion.g>

      {/* capsule */}
      <motion.g
        filter="url(#ph-shadow)"
        animate={{ y: [0, -8, 0], rotate: [-24, -16, -24] }}
        transition={{ duration: 3.7, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "444px 373px" }}
      >
        <rect x="402" y="356" width="84" height="34" rx="17" fill="#FFFFFF" />
        <path
          d="M444 356H469C478 356 486 364 486 373C486 382 478 390 469 390H444V356Z"
          fill="#53DFE9"
        />
      </motion.g>

      {/* stock badge */}
      <motion.g
        filter="url(#ph-shadow)"
        animate={{ scale: [1, 1.05, 1], y: [0, -4, 0] }}
        transition={{ duration: 2.9, repeat: Infinity }}
        style={{ transformOrigin: "91px 64px" }}
      >
        <rect x="40" y="35" width="104" height="69" rx="18" fill="#FFFFFF" />
        <rect x="58" y="54" width="17" height="32" rx="5" fill="#82C8F7" />
        <rect x="82" y="45" width="17" height="41" rx="5" fill="#47D2E5" />
        <rect x="106" y="61" width="17" height="25" rx="5" fill="#4F94EE" />
      </motion.g>
    </svg>
  );
}

function SlideIllustration({ id }: { id: SlideId }) {
  if (id === "clinic") return <ClinicIllustration />;
  if (id === "laboratory") return <LaboratoryIllustration />;
  return <PharmacyIllustration />;
}

function HealthcareCarousel() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;

    const interval = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 4500);

    return () => window.clearInterval(interval);
  }, [paused]);

  const slide = slides[activeSlide];

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-8 pt-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            className="flex w-full items-center justify-center"
            initial={{ opacity: 0, x: 45, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -45, scale: 0.96 }}
            transition={{ duration: 0.58, ease: "easeOut" }}
          >
            <SlideIllustration id={slide.id} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative z-10 min-h-[220px] px-12 pb-11">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${slide.id}-copy`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.42 }}
          >
            <p className="text-[10px] font-bold tracking-[0.24em] text-cyan-100 uppercase">
              {slide.eyebrow}
            </p>

            <h2 className="mt-3 text-[39px] font-bold leading-tight tracking-tight text-white">
              {slide.title}
            </h2>

            <p className="mt-4 max-w-[470px] text-[15px] leading-7 text-blue-50">
              {slide.description}
            </p>
          </motion.div>
        </AnimatePresence>

        <div className="mt-7 flex items-center gap-3">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSlide(index)}
              aria-label={`Show ${item.title}`}
              aria-current={activeSlide === index ? "true" : undefined}
              className={`transition-all ${
                activeSlide === index
                  ? "h-2.5 w-8 rounded-full bg-white"
                  : "h-2.5 w-2.5 rounded-full border-2 border-white/80 bg-transparent hover:bg-white/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function LoginFrame({
  platform = false,
  title,
  description,
  children,
}: {
  platform?: boolean;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#edf8ff] p-4 sm:p-6 lg:p-8">
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute -left-24 top-20 h-72 w-72 rounded-full border border-blue-200" />
        <div className="absolute -right-24 bottom-[-80px] h-96 w-96 rounded-full border border-cyan-200" />
      </div>

      <div className="relative z-10 grid min-h-[720px] w-full max-w-[1280px] overflow-hidden rounded-[22px] bg-white shadow-[0_24px_80px_rgba(22,104,190,0.17)] lg:grid-cols-2">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-[#1988ff] via-[#0b76ed] to-[#0864d8] lg:flex lg:flex-col">
          <div className="absolute -right-28 -top-28 h-[340px] w-[340px] rounded-full bg-white/[0.06]" />
          <div className="absolute -bottom-40 -left-24 h-[360px] w-[360px] rounded-full bg-cyan-300/[0.10]" />

          <div className="relative z-10 px-12 pt-11">
            <NidwaLogo />
          </div>

          {platform ? (
            <>
              <div className="relative z-10 flex flex-1 items-center justify-center px-9">
                <ClinicIllustration />
              </div>

              <div className="relative z-10 min-h-[210px] px-12 pb-11">
                <p className="text-[10px] font-bold tracking-[0.24em] text-cyan-100 uppercase">
                  PLATFORM ADMINISTRATION
                </p>
                <h2 className="mt-3 text-[39px] font-bold text-white">Platform Control</h2>
                <p className="mt-4 max-w-[460px] text-[15px] leading-7 text-blue-50">
                  Manage healthcare organizations, subscriptions and platform operations from one
                  secure workspace.
                </p>
              </div>
            </>
          ) : (
            <HealthcareCarousel />
          )}
        </section>

        <section className="relative flex min-h-[720px] items-center justify-center bg-white px-7 py-12 sm:px-14 lg:px-[90px]">
          <div className="absolute right-12 top-12 grid grid-cols-3 gap-2">
            <div />
            <div className="h-4 w-4 rounded bg-[#e2efff]" />
            <div />
            <div />
            <div className="h-6 w-6 rounded bg-[#e2efff]" />
            <div />
            <div />
            <div />
            <div className="h-4 w-4 rounded bg-[#e2efff]" />
          </div>

          <div className="w-full max-w-[440px]">
            <div className="mb-8 lg:hidden">
              <p className="text-2xl font-bold text-[#0877ef]">Nidwa ICT</p>
              <p className="mt-1 text-[10px] font-semibold tracking-[0.22em] text-slate-400 uppercase">
                Healthcare Solutions
              </p>
            </div>

            <p className="text-xs font-bold tracking-[0.24em] text-[#0877ef] uppercase">
              Secure Access
            </p>

            <h1 className="mt-4 text-[44px] font-bold leading-none tracking-[-0.045em] text-[#07152f] sm:text-[46px]">
              {title}
            </h1>

            <p className="mt-4 max-w-sm text-[16px] leading-6 text-slate-500">{description}</p>

            <div className="mt-10">{children}</div>

            <p className="mt-11 text-center text-[11px] text-slate-400">
              Powered by PHMS Healthcare Management System
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function LoginField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-[11px] font-bold tracking-[0.035em] text-[#253b61] uppercase">
        {label}
      </label>

      <div className="flex h-[57px] items-center gap-3">
        <div className="grid h-[57px] w-[57px] shrink-0 place-items-center rounded-lg bg-[#eff5fb] text-[#1d4b91]">
          {icon}
        </div>

        <div className="flex h-[57px] min-w-0 flex-1 items-center rounded-lg border border-[#c8d8ec] bg-white px-3 transition focus-within:border-[#0877ef] focus-within:ring-2 focus-within:ring-blue-100">
          {children}
        </div>
      </div>
    </div>
  );
}

export function TenantLoginPage() {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    tenantSlug: "",
    username: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    setError("");
    setPending(true);

    try {
      const principal = await sendData<TenantPrincipal>("post", "/auth/login", form);

      queryClient.setQueryData(["tenant-principal"], principal);

      await queryClient.invalidateQueries({
        queryKey: ["tenant-workspace"],
      });

      showToast({
        title: "Login successful",
        message: `Welcome back, ${principal.fullName}.`,
      });

      navigate(tenantLandingPath(principal.role), true);
    } catch (caught) {
      const message = errorMessage(caught);

      setError(message);

      showToast({
        title: "Login failed",
        message,
        tone: "error",
        durationMs: 10_000,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <LoginFrame
      title="Log In"
      description="Enter your organization and account details to continue."
    >
      <form className="space-y-6" onSubmit={(event) => void submit(event)}>
        <LoginField label="Organization" icon={<Building2 size={19} />}>
          <input
            type="text"
            placeholder="your-organization"
            autoComplete="organization"
            value={form.tenantSlug}
            onChange={(event) =>
              setForm({
                ...form,
                tenantSlug: event.target.value,
              })
            }
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
            required
          />
        </LoginField>

        <LoginField label="Username" icon={<UserRound size={20} />}>
          <input
            type="text"
            placeholder="Enter your username"
            autoComplete="username"
            value={form.username}
            onChange={(event) =>
              setForm({
                ...form,
                username: event.target.value,
              })
            }
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
            required
          />
        </LoginField>

        <LoginField label="Password" icon={<LockKeyhole size={20} />}>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            autoComplete="current-password"
            value={form.password}
            onChange={(event) =>
              setForm({
                ...form,
                password: event.target.value,
              })
            }
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
            required
          />

          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="grid size-9 shrink-0 place-items-center text-slate-400 transition hover:text-[#0877ef]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </LoginField>

        {error ? (
          <div className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3">
            <p className="text-sm font-medium text-rose-700">{error}</p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex h-[55px] w-full items-center justify-center gap-3 rounded-lg bg-[#0877ef] px-6 text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(8,119,239,0.18)] transition hover:bg-[#066ad8] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowRight size={20} />
          {pending ? "Signing in..." : "Sign in"}
        </button>

        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-semibold text-slate-400">OR</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <Link
          to="/accept-invitation"
          className="flex items-center justify-center gap-2 text-sm font-semibold text-[#0877ef] transition hover:text-[#0668d4]"
        >
          <Mail size={18} />
          Accept a staff invitation
        </Link>
      </form>
    </LoginFrame>
  );
}

export function PlatformLoginPage() {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    setError("");
    setPending(true);

    try {
      const principal = await sendData<PlatformPrincipal>("post", "/platform/auth/login", form);

      queryClient.setQueryData(["platform-principal"], principal);

      showToast({
        title: "Login successful",
        message: `Welcome back, ${principal.fullName}.`,
      });

      navigate(platformDashboardPath, true);
    } catch (caught) {
      const message = errorMessage(caught);

      setError(message);

      showToast({
        title: "Login failed",
        message,
        tone: "error",
        durationMs: 10_000,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <LoginFrame
      platform
      title="Platform Log In"
      description="Sign in with your PHMS Platform Administrator account."
    >
      <form className="space-y-6" onSubmit={(event) => void submit(event)}>
        <LoginField label="Platform Email" icon={<Mail size={19} />}>
          <input
            type="email"
            placeholder="admin@example.com"
            autoComplete="username"
            value={form.email}
            onChange={(event) =>
              setForm({
                ...form,
                email: event.target.value,
              })
            }
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
            required
          />
        </LoginField>

        <LoginField label="Password" icon={<LockKeyhole size={20} />}>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            autoComplete="current-password"
            value={form.password}
            onChange={(event) =>
              setForm({
                ...form,
                password: event.target.value,
              })
            }
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
            required
          />

          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="grid size-9 shrink-0 place-items-center text-slate-400 transition hover:text-[#0877ef]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </LoginField>

        {error ? (
          <div className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3">
            <p className="text-sm font-medium text-rose-700">{error}</p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex h-[55px] w-full items-center justify-center gap-3 rounded-lg bg-[#0877ef] px-6 text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(8,119,239,0.18)] transition hover:bg-[#066ad8] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ShieldCheck size={19} />
          {pending ? "Signing in..." : "Sign in securely"}
        </button>
      </form>
    </LoginFrame>
  );
}

export function AcceptInvitationPage() {
  const query = new URLSearchParams(window.location.search);

  const [form, setForm] = useState({
    token: query.get("token") ?? "",
    fullName: "",
    password: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    setError("");
    setMessage("");
    setPending(true);

    try {
      await sendData("post", "/tenant/invitations/accept", form);

      setMessage("Account created successfully. You can now sign in with your invited username.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <LoginFrame
      title="Create Account"
      description="Accept your staff invitation and create your PHMS account."
    >
      <form className="space-y-6" onSubmit={(event) => void submit(event)}>
        <div>
          <label className="mb-2 block text-[11px] font-bold tracking-[0.035em] text-[#253b61] uppercase">
            Invitation Token
          </label>

          <textarea
            className="min-h-[90px] w-full resize-none rounded-lg border border-[#c8d8ec] bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#0877ef] focus:ring-2 focus:ring-blue-100"
            placeholder="Paste invitation token"
            value={form.token}
            onChange={(event) =>
              setForm({
                ...form,
                token: event.target.value,
              })
            }
            required
          />
        </div>

        <LoginField label="Full Name" icon={<UserRound size={20} />}>
          <input
            type="text"
            placeholder="Enter your full name"
            value={form.fullName}
            onChange={(event) =>
              setForm({
                ...form,
                fullName: event.target.value,
              })
            }
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
            required
          />
        </LoginField>

        <LoginField label="Create Password" icon={<KeyRound size={20} />}>
          <input
            type={showPassword ? "text" : "password"}
            minLength={12}
            placeholder="Minimum 12 characters"
            value={form.password}
            onChange={(event) =>
              setForm({
                ...form,
                password: event.target.value,
              })
            }
            className="h-full min-w-0 flex-1 border-0 bg-transparent px-1 text-[15px] text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0"
            required
          />

          <button
            type="button"
            onClick={() => setShowPassword((current) => !current)}
            className="grid size-9 shrink-0 place-items-center text-slate-400 transition hover:text-[#0877ef]"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
          </button>
        </LoginField>

        {message ? (
          <div className="border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-medium text-emerald-700">{message}</p>
          </div>
        ) : null}

        {error ? (
          <div className="border-l-4 border-rose-500 bg-rose-50 px-4 py-3">
            <p className="text-sm font-medium text-rose-700">{error}</p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="flex h-[55px] w-full items-center justify-center gap-3 rounded-lg bg-[#0877ef] px-6 text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(8,119,239,0.18)] transition hover:bg-[#066ad8] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ArrowRight size={20} />
          {pending ? "Creating account..." : "Create account"}
        </button>

        <Link
          to="/login"
          className="flex items-center justify-center text-sm font-semibold text-[#0877ef] transition hover:text-[#0668d4]"
        >
          Return to sign in
        </Link>
      </form>
    </LoginFrame>
  );
}
