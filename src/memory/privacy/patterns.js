export const RAW_URL = /https?:\/\//iu;
export const RAW_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\b/iu;
export const NON_HTTP_URI = /(?<![A-Z0-9+.-])(?!https?:)[A-Z][A-Z0-9+.-]{1,31}:[^\s<>()]+/iu;
export const BARE_DOMAIN = /(?<![\p{L}\p{N}_@/.-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+(?:[\p{L}]{2,63}|xn--[a-z0-9-]{2,59})(?![\p{L}\p{N}_-])/iu;
export const IPV4_ADDRESS = /(?<![\w@])(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?(?![\w.])/u;
export const IPV6_ADDRESS = /(?<![A-F0-9:])(?:\[[A-F0-9:]{2,}\]|(?:[A-F0-9]{0,4}:){2,7}[A-F0-9]{0,4})(?::\d{1,5})?(?![A-F0-9:])/iu;
export const LOCALHOST = /(?<![\p{L}\p{N}_-])localhost(?::\d{1,5})?(?![\p{L}\p{N}_-])/iu;
export const SECRET = /\b(?:sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u;
