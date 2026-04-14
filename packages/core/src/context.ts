/**
 * Contexte fourni au moteur (edge, API, navigateur).
 * Les champs geo / IP sont en général remplis côté serveur ou CDN ;
 * navigateur, URL, écran, cookies, DOM et règles custom côté client.
 */
export interface UserContext {
  userId?: string;
  /** Pays visiteur (ex. GeoIP / CDN), codes ISO — aligné ciblage « origine IP ». */
  country?: string;
  /** Région (code ou libellé selon votre pipeline GeoIP). */
  region?: string;
  /** Ville (libellé ou code selon votre pipeline GeoIP). */
  city?: string;
  device?: "desktop" | "mobile" | "tablet";
  loggedIn?: boolean;
  /** Chemin seul (ex. pathname). */
  route?: string;
  /** URL complète (href) pour règles `url` / cohérence. */
  url?: string;
  /** Paramètres de requête (clé → valeur ou liste si doublons). */
  queryParams?: Record<string, string | string[]>;
  screenWidth?: number;
  screenHeight?: number;
  /** Identifiant navigateur normalisé (ex. chrome, firefox, safari). */
  browser?: string;
  browserVersion?: string;
  /** ex. navigator.language */
  browserLanguage?: string;
  /** Cookies visibles côté client (nom → valeur). */
  cookies?: Record<string, string>;
  /**
   * Présence d’éléments DOM : la clé est un `presenceKey` défini dans la règle,
   * rempli par l’hôte (ex. querySelector) avant l’appel à `/evaluate`.
   */
  domPresence?: Record<string, boolean>;
  /**
   * Résultats de règles custom enregistrées côté hôte (`ruleId` → true si match).
   */
  customRuleResults?: Record<string, boolean>;
  /**
   * Nouveau vs visiteur déjà vu (souvent dérivé d’un cookie 1st-party ou d’un identifiant côté serveur).
   */
  visitorType?: "new" | "returning";
  /**
   * Variation déjà assignée (lue depuis un cookie, etc.) pour cette campagne.
   * Peut être une chaîne numérique si le contexte vient du navigateur.
   */
  assignedVariationId?: number | string;
  [key: string]: unknown;
}
