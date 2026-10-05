/** ISO 3166-1 alpha-2 countries for billing. The UAE comes first: it is where VAT applies. */
const RAW =
    'AE:United Arab Emirates|SA:Saudi Arabia|QA:Qatar|KW:Kuwait|BH:Bahrain|OM:Oman|PK:Pakistan|IN:India|EG:Egypt|JO:Jordan|LB:Lebanon|GB:United Kingdom|US:United States|' +
    'AF:Afghanistan|AL:Albania|DZ:Algeria|AD:Andorra|AO:Angola|AR:Argentina|AM:Armenia|AU:Australia|AT:Austria|AZ:Azerbaijan|BD:Bangladesh|BY:Belarus|BE:Belgium|BJ:Benin|' +
    'BT:Bhutan|BO:Bolivia|BA:Bosnia and Herzegovina|BW:Botswana|BR:Brazil|BN:Brunei|BG:Bulgaria|BF:Burkina Faso|KH:Cambodia|CM:Cameroon|CA:Canada|TD:Chad|CL:Chile|CN:China|' +
    'CO:Colombia|CR:Costa Rica|CI:Côte d’Ivoire|HR:Croatia|CY:Cyprus|CZ:Czechia|CD:DR Congo|DK:Denmark|DJ:Djibouti|DO:Dominican Republic|EC:Ecuador|SV:El Salvador|EE:Estonia|' +
    'ET:Ethiopia|FI:Finland|FR:France|GE:Georgia|DE:Germany|GH:Ghana|GR:Greece|GT:Guatemala|HN:Honduras|HK:Hong Kong|HU:Hungary|IS:Iceland|ID:Indonesia|IQ:Iraq|IE:Ireland|' +
    'IL:Israel|IT:Italy|JM:Jamaica|JP:Japan|KZ:Kazakhstan|KE:Kenya|KG:Kyrgyzstan|LA:Laos|LV:Latvia|LY:Libya|LI:Liechtenstein|LT:Lithuania|LU:Luxembourg|MO:Macao|MG:Madagascar|' +
    'MW:Malawi|MY:Malaysia|MV:Maldives|ML:Mali|MT:Malta|MR:Mauritania|MU:Mauritius|MX:Mexico|MD:Moldova|MC:Monaco|MN:Mongolia|ME:Montenegro|MA:Morocco|MZ:Mozambique|MM:Myanmar|' +
    'NA:Namibia|NP:Nepal|NL:Netherlands|NZ:New Zealand|NI:Nicaragua|NE:Niger|NG:Nigeria|MK:North Macedonia|NO:Norway|PS:Palestine|PA:Panama|PY:Paraguay|PE:Peru|PH:Philippines|' +
    'PL:Poland|PT:Portugal|RO:Romania|RU:Russia|RW:Rwanda|SN:Senegal|RS:Serbia|SG:Singapore|SK:Slovakia|SI:Slovenia|SO:Somalia|ZA:South Africa|KR:South Korea|ES:Spain|' +
    'LK:Sri Lanka|SD:Sudan|SE:Sweden|CH:Switzerland|TW:Taiwan|TJ:Tajikistan|TZ:Tanzania|TH:Thailand|TN:Tunisia|TR:Türkiye|TM:Turkmenistan|UG:Uganda|UA:Ukraine|UY:Uruguay|' +
    'UZ:Uzbekistan|VE:Venezuela|VN:Vietnam|YE:Yemen|ZM:Zambia|ZW:Zimbabwe';

export const COUNTRIES: { code: string; name: string }[] = RAW.split('|').map((entry) => {
    const [code, name] = entry.split(':');

    return { code, name };
});

export const VAT_COUNTRY = 'AE';

/** Best guess from the browser's time zone, so most people do not have to pick. */
export function guessCountry(): string {
    const zone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '';
    const byZone: Record<string, string> = {
        'Asia/Dubai': 'AE',
        'Asia/Karachi': 'PK',
        'Asia/Riyadh': 'SA',
        'Asia/Qatar': 'QA',
        'Asia/Kuwait': 'KW',
        'Asia/Bahrain': 'BH',
        'Asia/Muscat': 'OM',
        'Asia/Kolkata': 'IN',
        'Africa/Cairo': 'EG',
        'Europe/London': 'GB',
    };

    return byZone[zone] ?? '';
}
