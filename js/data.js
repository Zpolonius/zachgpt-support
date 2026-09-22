/* Indhold og satser. Alt det sjove bor her — rediger frit.
   Hver PRESET er en linjepost på regningen og en kategori i køen.
   `unit` er prisen per stk i kroner. */
window.ZG = window.ZG || {};

(function (ZG) {
  "use strict";

  var PRESETS = [
    { id: "support",  desc: "Teknisk support",                              note: "Inkl. sager der startede med “det haster lige lidt”", unit: 249 },
    { id: "checkout", desc: "Checkout review",                              note: "Fandt tre ting ingen havde bedt mig kigge efter",     unit: 495 },
    { id: "mybring",  desc: "MyBring-support",                              note: "“Jeg kan ikke logge ind” · løst på 90 sekunder",      unit: 149 },
    { id: "google",   desc: "Spørgsmål der kunne være googlet",             note: "Besvaret uden kommentar. Det tæller ekstra.",         unit: 49  },
    { id: "emo",      desc: "Emotionel support ved fragtaftaler",           note: "Lyttede hele vejen igennem",                          unit: 350 },
    { id: "sofa",     desc: "Svar uden for arbejdstid",                     note: "Efter 21.00. Fra sofaen.",                            unit: 450 },
    { id: "akut",     desc: "Akut hjælp fem minutter før et møde",          note: "Du sagde “du er en helt”. Det er noteret.",           unit: 550 },
    { id: "fil",      desc: "Fandt filen du selv havde gemt",               note: "Den lå i Teams. Selvfølgelig.",                       unit: 199 },
    { id: "igen",     desc: "Forklarede det samme én gang til",             note: "Med samme tålmodighed som første gang",               unit: 129 },
    { id: "fejl",     desc: "Oversatte en fejlbesked til dansk",            note: "Uden at grine",                                       unit: 175 },
    { id: "skaerm",   desc: "Kiggede på din skærm og så det med det samme", note: "Det tog fire sekunder. Du havde brugt en time.",      unit: 275 },
    { id: "udenfor",  desc: "Ikke mit bord",                            note: "Ikke det jeg er ansat til. Men af mit gode hjerte.",  unit: 650 },
    { id: "navn",     desc: "Brug af varemærket “ZachGPT”",                 note: "Licens ikke faktureret i denne periode",              unit: 0   }
  ];

  var URGENCY = [
    { id: "lav",   label: "Kan godt vente",  sla: "Estimeret svar: samme dag.",
      ack: "Tak. Du er hermed min yndlingskollega." },
    { id: "mel",   label: "Når du har tid",  sla: "Estimeret svar: inden frokost.",
      ack: "Sundt valg. Det belønner sig." },
    { id: "hoej",  label: "Det haster lidt", sla: "Estimeret svar: 4 minutter.",
      ack: "Det gør det altid. Jeg kigger på det nu." },
    { id: "braen", label: "DET BRÆNDER",     sla: "Estimeret svar: 2 hverdage.",
      ack: "Hastegrad er noteret og arkiveret. Alt brænder hos alle." }
  ];

  var TIERS = [
    { min: 30, name: "Månedens Medarbejder (kandidat)", perk: "Nominering under behandling. Sagsbehandler: mig." },
    { min: 25, name: "ZachGPT Platinum",  perk: "Direkte linje. Ingen kø." },
    { min: 20, name: "ZachGPT Guld",      perk: "Forrest i køen næste gang noget brænder." },
    { min: 15, name: "ZachGPT Sølv",      perk: "Svar inden frokost." },
    { min: 1,  name: "ZachGPT Bronze",    perk: "Bedre end ingenting. Meget bedre." },
    { min: 0,  name: "Under observation", perk: "Estimeret svartid: 3–5 hverdage." }
  ];

  var STAGES = [
    { face: "🥺", title: "Er du sikker?",
      body: "Synes du ikke, jeg gør det godt? Jeg svarede dig på fire minutter. Fire.",
      yes: "Du har ret — jeg giver tip", no: "Ja, jeg er sikker" },
    { face: "😔", title: "Okay. Men lige for at have det med.",
      body: "Jeg svarede dig kl. 22.47 i tirsdags. Om et checkout-flow. Fra sofaen. Jeg nævner det bare.",
      yes: "Fint, fint — jeg giver tip", no: "Stadig sikker" },
    { face: "🫥", title: "Så gør vi det på den måde.",
      body: "Næste MyBring-spørgsmål bliver besvaret med “har du prøvet at læse dokumentationen?”. Du kender mig. Jeg gør det.",
      yes: "Nej nej nej — jeg giver tip", no: "Jeg accepterer konsekvenserne" }
  ];

  /* Betaling ved nominering. Værdien er sat til 30 % — anerkendelse er dyrere end penge. */
  var NOMINATION = {
    pct: 30,
    reasons: [
      "Svarer hurtigere end vores egne systemer",
      "Har aldrig sagt “det er ikke mit bord”",
      "Redder mig i checkout mindst én gang om ugen",
      "Forklarer ting uden at få mig til at føle mig dum",
      "Er billigere end en konsulent og i bedre humør",
      "Skriv min egen begrundelse"
    ],
    placeholder: "Fx: Løste på fire minutter det, jeg havde siddet med i to dage.",
    thanks: "Nomineringen er modtaget.",
    sub: "Den er videresendt til HR. HR er i denne sammenhæng også mig.",
    fine: [
      "Betalingsmetode: anerkendelse.",
      "Din begrundelse er offentliggjort på Ærestavlen. Ja, med dit navn.",
      "Nomineringen behandles på næste afdelingsmøde, som jeg også selv indkalder til."
    ]
  };

  var REBOOTS = [
    "Nej. Det har du ikke.",
    "Prøv igen, men denne gang med overbevisning.",
    "Systemet er genstartet. Problemet består.",
    "Det virkede. Vi ved ikke hvorfor. Rør ikke ved noget.",
    "Har du prøvet at spørge Zacharias i stedet?"
  ];

  ZG.PRESETS = PRESETS;
  ZG.URGENCY = URGENCY;
  ZG.TIERS = TIERS;
  ZG.STAGES = STAGES;
  ZG.NOMINATION = NOMINATION;
  ZG.REBOOTS = REBOOTS;
})(window.ZG);
