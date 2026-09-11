import type { PetSpecies } from "../types";

export const petLabels: Record<PetSpecies, string> = { cat: "小猫", dog: "小狗", rabbit: "小兔" };

export function PetArt({ species }: { species: PetSpecies }) {
  const fur = { cat: "#f3d8ad", dog: "#d6a57b", rabbit: "#f6eee0" }[species];
  return (
    <svg className={`pet-art pet-art-${species}`} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <ellipse cx="60" cy="110" rx="37" ry="5" fill="currentColor" opacity=".12" />
      <g className="pet-body" stroke="#695347" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
        {species === "rabbit" ? <circle cx="89" cy="96" r="9" fill={fur} /> : <path className="pet-tail" d={species === "cat" ? "M83 96C115 102 114 70 102 78" : "M84 96Q109 76 104 95Q101 106 85 104"} stroke={fur} strokeWidth="11" />}
        <ellipse cx="60" cy="86" rx="28" ry="23" fill={fur} />
        <ellipse cx="60" cy="90" rx="15" ry="15" fill="#fff6e8" stroke="none" />
        <g className="pet-head">
          {species === "rabbit" ? <><path d="M40 48C21 2 49 0 51 45" fill={fur} /><path d="M69 45C70 0 97 2 80 48" fill={fur} /><path d="M42 34L39 18M78 34L81 18" stroke="#e9b7ae" strokeWidth="6" /></> : species === "cat" ? <><path d="M28 51L28 22L51 37M69 37L92 22L92 53" fill={fur} /><path d="M34 39L34 31L43 38M78 38L86 31L86 40" stroke="#deb0a0" strokeWidth="4" /></> : <><path d="M37 36C14 28 12 75 28 73L41 52M83 36C106 28 108 75 92 73L79 52" fill="#a87554" /></>}
          <rect x="26" y="35" width="68" height="48" rx="24" fill={fur} />
          <ellipse cx="39" cy="66" rx="7" ry="4" fill="#e8aa9f" stroke="none" opacity=".7" /><ellipse cx="81" cy="66" rx="7" ry="4" fill="#e8aa9f" stroke="none" opacity=".7" />
          <g className="pet-eyes" fill="#493d36" stroke="none"><ellipse cx="45" cy="57" rx="3" ry="4" /><ellipse cx="75" cy="57" rx="3" ry="4" /></g>
          <path d="M57 64L60 67L63 64Z" fill="#a77068" stroke="#a77068" /><path d="M60 67C59 73 53 71 53 69M60 67C61 73 67 71 67 69" />
        </g>
        <path d="M38 86Q31 105 44 107M82 86Q89 105 76 107" fill={fur} />
        <path d="M48 82Q60 88 72 82" stroke="var(--accent-vermilion)" strokeWidth="5" />
        <circle cx="60" cy="86" r="4" fill="#f0cd78" stroke="none" />
      </g>
    </svg>
  );
}
