/* ShutterBlip — where players are, and what time it is for them.
 *
 * WHY NOT IP GEOLOCATION. The obvious way to answer "where are my players"
 * is to look up the IP address. We deliberately do not. It needs a licensed
 * database (MaxMind et al) or a third-party API — which means either a
 * recurring dependency that can go down, or sending every player's IP to
 * someone else's server. It is also wrong often enough to be annoying:
 * mobile carriers route through far-away gateways and VPN users land in
 * whichever country their provider fancies.
 *
 * Instead the client tells us one thing it already knows about itself:
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` — a string like
 * "America/Denver". That is a setting on their device, not a measurement of
 * where their body is. It is enough to say "most of your players are in the
 * US and the UK", it is exactly right for "what hour is it where they are",
 * and it cannot pinpoint anybody. A city name in a timezone is the name of
 * the zone, not the player's town: everyone from Maine to Miami reports
 * "America/New_York".
 *
 * The privacy policy says this in the same terms. Do not swap this for an
 * IP lookup without changing that text first.
 */
'use strict';

/* IANA zone -> ISO 3166-1 alpha-2, from the zone1970.tab country column.
   Written as "CC zone zone zone" lines to keep it readable and small. Zones
   that no longer exist as canonical names still resolve, because old clients
   and old OS installs keep sending them for years. */
const TABLE = `
US America/New_York America/Detroit America/Kentucky/Louisville America/Kentucky/Monticello America/Indiana/Indianapolis America/Indiana/Vincennes America/Indiana/Winamac America/Indiana/Marengo America/Indiana/Petersburg America/Indiana/Vevay America/Chicago America/Indiana/Tell_City America/Indiana/Knox America/Menominee America/North_Dakota/Center America/North_Dakota/New_Salem America/North_Dakota/Beulah America/Denver America/Boise America/Phoenix America/Los_Angeles America/Anchorage America/Juneau America/Sitka America/Metlakatla America/Yakutat America/Nome America/Adak Pacific/Honolulu US/Eastern US/Central US/Mountain US/Pacific US/Alaska US/Hawaii America/Shiprock America/Atka America/Fort_Wayne America/Knox_IN America/Louisville America/Indianapolis Navajo
CA America/St_Johns America/Halifax America/Glace_Bay America/Moncton America/Goose_Bay America/Toronto America/Iqaluit America/Winnipeg America/Resolute America/Rankin_Inlet America/Regina America/Swift_Current America/Edmonton America/Cambridge_Bay America/Inuvik America/Dawson_Creek America/Fort_Nelson America/Whitehorse America/Dawson America/Vancouver America/Creston America/Blanc-Sablon America/Atikokan America/Nipigon America/Thunder_Bay America/Pangnirtung America/Rainy_River America/Yellowknife America/Coral_Harbour Canada/Eastern Canada/Central Canada/Mountain Canada/Pacific Canada/Atlantic Canada/Newfoundland Canada/Saskatchewan
MX America/Mexico_City America/Cancun America/Merida America/Monterrey America/Matamoros America/Chihuahua America/Ciudad_Juarez America/Ojinaga America/Mazatlan America/Bahia_Banderas America/Hermosillo America/Tijuana America/Ensenada America/Santa_Isabel Mexico/General Mexico/BajaNorte Mexico/BajaSur
GB Europe/London GB GB-Eire Europe/Belfast
IE Europe/Dublin Eire
FR Europe/Paris
DE Europe/Berlin Europe/Busingen
ES Europe/Madrid Africa/Ceuta Atlantic/Canary
PT Europe/Lisbon Atlantic/Madeira Atlantic/Azores Portugal
IT Europe/Rome
NL Europe/Amsterdam
BE Europe/Brussels
CH Europe/Zurich
AT Europe/Vienna
SE Europe/Stockholm
NO Europe/Oslo Arctic/Longyearbyen Atlantic/Jan_Mayen
DK Europe/Copenhagen
FI Europe/Helsinki Europe/Mariehamn
IS Atlantic/Reykjavik Iceland
PL Europe/Warsaw Poland
CZ Europe/Prague
SK Europe/Bratislava
HU Europe/Budapest
RO Europe/Bucharest
BG Europe/Sofia
GR Europe/Athens
TR Europe/Istanbul Asia/Istanbul Turkey
RU Europe/Moscow Europe/Kaliningrad Europe/Kirov Europe/Volgograd Europe/Astrakhan Europe/Saratov Europe/Ulyanovsk Europe/Samara Asia/Yekaterinburg Asia/Omsk Asia/Novosibirsk Asia/Barnaul Asia/Tomsk Asia/Novokuznetsk Asia/Krasnoyarsk Asia/Irkutsk Asia/Chita Asia/Yakutsk Asia/Khandyga Asia/Vladivostok Asia/Ust-Nera Asia/Magadan Asia/Sakhalin Asia/Srednekolymsk Asia/Kamchatka Asia/Anadyr W-SU
UA Europe/Kyiv Europe/Kiev Europe/Simferopol Europe/Uzhgorod Europe/Zaporozhye
BY Europe/Minsk
LT Europe/Vilnius
LV Europe/Riga
EE Europe/Tallinn
MD Europe/Chisinau Europe/Tiraspol
RS Europe/Belgrade
HR Europe/Zagreb
SI Europe/Ljubljana
BA Europe/Sarajevo
MK Europe/Skopje
AL Europe/Tirane
ME Europe/Podgorica
MT Europe/Malta
CY Asia/Nicosia Asia/Famagusta Europe/Nicosia
LU Europe/Luxembourg
MC Europe/Monaco
AD Europe/Andorra
GI Europe/Gibraltar
LI Europe/Vaduz
SM Europe/San_Marino
VA Europe/Vatican
AU Australia/Sydney Australia/Melbourne Australia/Brisbane Australia/Perth Australia/Adelaide Australia/Hobart Australia/Darwin Australia/Canberra Australia/Broken_Hill Australia/Lindeman Australia/Lord_Howe Australia/Eucla Australia/Currie Antarctica/Macquarie Australia/ACT Australia/NSW Australia/North Australia/Queensland Australia/South Australia/Tasmania Australia/Victoria Australia/West Australia/Yancowinna Australia/LHI
NZ Pacific/Auckland Pacific/Chatham NZ NZ-CHAT Antarctica/McMurdo Antarctica/South_Pole
JP Asia/Tokyo Japan
KR Asia/Seoul ROK
KP Asia/Pyongyang
CN Asia/Shanghai Asia/Urumqi Asia/Harbin Asia/Chongqing Asia/Chungking Asia/Kashgar PRC
HK Asia/Hong_Kong Hongkong
TW Asia/Taipei ROC
MO Asia/Macau Asia/Macao
SG Asia/Singapore Singapore
MY Asia/Kuala_Lumpur Asia/Kuching
ID Asia/Jakarta Asia/Pontianak Asia/Makassar Asia/Jayapura
TH Asia/Bangkok
VN Asia/Ho_Chi_Minh Asia/Saigon
PH Asia/Manila
IN Asia/Kolkata Asia/Calcutta
PK Asia/Karachi
BD Asia/Dhaka Asia/Dacca
LK Asia/Colombo
NP Asia/Kathmandu Asia/Katmandu
MM Asia/Yangon Asia/Rangoon
KH Asia/Phnom_Penh
LA Asia/Vientiane
MN Asia/Ulaanbaatar Asia/Hovd Asia/Choibalsan Asia/Ulan_Bator
KZ Asia/Almaty Asia/Qyzylorda Asia/Qostanay Asia/Aqtobe Asia/Aqtau Asia/Atyrau Asia/Oral
UZ Asia/Tashkent Asia/Samarkand
KG Asia/Bishkek
TJ Asia/Dushanbe
TM Asia/Ashgabat Asia/Ashkhabad
AF Asia/Kabul
IR Asia/Tehran Iran
IQ Asia/Baghdad
SA Asia/Riyadh
AE Asia/Dubai
QA Asia/Qatar
KW Asia/Kuwait
BH Asia/Bahrain
OM Asia/Muscat
YE Asia/Aden
JO Asia/Amman
LB Asia/Beirut
SY Asia/Damascus
IL Asia/Jerusalem Asia/Tel_Aviv Israel
PS Asia/Gaza Asia/Hebron
GE Asia/Tbilisi
AM Asia/Yerevan
AZ Asia/Baku
BR America/Sao_Paulo America/Bahia America/Fortaleza America/Recife America/Maceio America/Belem America/Santarem America/Araguaina America/Campo_Grande America/Cuiaba America/Manaus America/Boa_Vista America/Porto_Velho America/Rio_Branco America/Eirunepe America/Noronha America/Porto_Acre Brazil/East Brazil/West Brazil/Acre Brazil/DeNoronha
AR America/Argentina/Buenos_Aires America/Argentina/Cordoba America/Argentina/Salta America/Argentina/Jujuy America/Argentina/Tucuman America/Argentina/Catamarca America/Argentina/La_Rioja America/Argentina/San_Juan America/Argentina/Mendoza America/Argentina/San_Luis America/Argentina/Rio_Gallegos America/Argentina/Ushuaia America/Buenos_Aires America/Cordoba America/Catamarca America/Jujuy America/Mendoza America/Rosario
CL America/Santiago America/Punta_Arenas Pacific/Easter Chile/Continental Chile/EasterIsland
CO America/Bogota
PE America/Lima
VE America/Caracas
EC America/Guayaquil Pacific/Galapagos
BO America/La_Paz
PY America/Asuncion
UY America/Montevideo
GY America/Guyana
SR America/Paramaribo
GF America/Cayenne
FK Atlantic/Stanley
CR America/Costa_Rica
PA America/Panama
GT America/Guatemala
SV America/El_Salvador
HN America/Tegucigalpa
NI America/Managua
BZ America/Belize
CU America/Havana Cuba
JM America/Jamaica Jamaica
HT America/Port-au-Prince
DO America/Santo_Domingo
PR America/Puerto_Rico
TT America/Port_of_Spain
BB America/Barbados
BS America/Nassau
BM Atlantic/Bermuda
KY America/Cayman
AW America/Aruba
CW America/Curacao America/Kralendijk America/Lower_Princes
ZA Africa/Johannesburg
NG Africa/Lagos
KE Africa/Nairobi
EG Africa/Cairo Egypt
MA Africa/Casablanca Africa/El_Aaiun
DZ Africa/Algiers
TN Africa/Tunis
LY Africa/Tripoli Libya
GH Africa/Accra
ET Africa/Addis_Ababa
TZ Africa/Dar_es_Salaam
UG Africa/Kampala
SN Africa/Dakar
CI Africa/Abidjan
CM Africa/Douala
CD Africa/Kinshasa Africa/Lubumbashi
AO Africa/Luanda
ZW Africa/Harare
ZM Africa/Lusaka
MZ Africa/Maputo
BW Africa/Gaborone
NA Africa/Windhoek
MU Indian/Mauritius
RE Indian/Reunion
MG Indian/Antananarivo
SD Africa/Khartoum
SS Africa/Juba
RW Africa/Kigali
ML Africa/Bamako
BF Africa/Ouagadougou
NE Africa/Niamey
TD Africa/Ndjamena
SO Africa/Mogadishu
FJ Pacific/Fiji
PG Pacific/Port_Moresby Pacific/Bougainville
GU Pacific/Guam
NC Pacific/Noumea
PF Pacific/Tahiti Pacific/Marquesas Pacific/Gambier
WS Pacific/Apia
TO Pacific/Tongatapu
VU Pacific/Efate
SB Pacific/Guadalcanal
`;

const ZONE_CC = Object.create(null);
for (const line of TABLE.trim().split('\n')){
  const parts = line.trim().split(/\s+/);
  const cc = parts[0];
  for (let i = 1; i < parts.length; i++) ZONE_CC[parts[i].toLowerCase()] = cc;
}

const NAMES = {
  US:'United States', CA:'Canada', MX:'Mexico', GB:'United Kingdom', IE:'Ireland', FR:'France',
  DE:'Germany', ES:'Spain', PT:'Portugal', IT:'Italy', NL:'Netherlands', BE:'Belgium',
  CH:'Switzerland', AT:'Austria', SE:'Sweden', NO:'Norway', DK:'Denmark', FI:'Finland',
  IS:'Iceland', PL:'Poland', CZ:'Czechia', SK:'Slovakia', HU:'Hungary', RO:'Romania',
  BG:'Bulgaria', GR:'Greece', TR:'Turkey', RU:'Russia', UA:'Ukraine', BY:'Belarus',
  LT:'Lithuania', LV:'Latvia', EE:'Estonia', MD:'Moldova', RS:'Serbia', HR:'Croatia',
  SI:'Slovenia', BA:'Bosnia', MK:'North Macedonia', AL:'Albania', ME:'Montenegro',
  MT:'Malta', CY:'Cyprus', LU:'Luxembourg', MC:'Monaco', AD:'Andorra', GI:'Gibraltar',
  LI:'Liechtenstein', SM:'San Marino', VA:'Vatican City',
  AU:'Australia', NZ:'New Zealand', JP:'Japan', KR:'South Korea', KP:'North Korea',
  CN:'China', HK:'Hong Kong', TW:'Taiwan', MO:'Macau', SG:'Singapore', MY:'Malaysia',
  ID:'Indonesia', TH:'Thailand', VN:'Vietnam', PH:'Philippines', IN:'India',
  PK:'Pakistan', BD:'Bangladesh', LK:'Sri Lanka', NP:'Nepal', MM:'Myanmar',
  KH:'Cambodia', LA:'Laos', MN:'Mongolia', KZ:'Kazakhstan', UZ:'Uzbekistan',
  KG:'Kyrgyzstan', TJ:'Tajikistan', TM:'Turkmenistan', AF:'Afghanistan', IR:'Iran',
  IQ:'Iraq', SA:'Saudi Arabia', AE:'United Arab Emirates', QA:'Qatar', KW:'Kuwait',
  BH:'Bahrain', OM:'Oman', YE:'Yemen', JO:'Jordan', LB:'Lebanon', SY:'Syria',
  IL:'Israel', PS:'Palestine', GE:'Georgia', AM:'Armenia', AZ:'Azerbaijan',
  BR:'Brazil', AR:'Argentina', CL:'Chile', CO:'Colombia', PE:'Peru', VE:'Venezuela',
  EC:'Ecuador', BO:'Bolivia', PY:'Paraguay', UY:'Uruguay', GY:'Guyana', SR:'Suriname',
  GF:'French Guiana', FK:'Falkland Islands', CR:'Costa Rica', PA:'Panama',
  GT:'Guatemala', SV:'El Salvador', HN:'Honduras', NI:'Nicaragua', BZ:'Belize',
  CU:'Cuba', JM:'Jamaica', HT:'Haiti', DO:'Dominican Republic', PR:'Puerto Rico',
  TT:'Trinidad & Tobago', BB:'Barbados', BS:'Bahamas', BM:'Bermuda', KY:'Cayman Islands',
  AW:'Aruba', CW:'Curaçao',
  ZA:'South Africa', NG:'Nigeria', KE:'Kenya', EG:'Egypt', MA:'Morocco', DZ:'Algeria',
  TN:'Tunisia', LY:'Libya', GH:'Ghana', ET:'Ethiopia', TZ:'Tanzania', UG:'Uganda',
  SN:'Senegal', CI:"Côte d'Ivoire", CM:'Cameroon', CD:'DR Congo', AO:'Angola',
  ZW:'Zimbabwe', ZM:'Zambia', MZ:'Mozambique', BW:'Botswana', NA:'Namibia',
  MU:'Mauritius', RE:'Réunion', MG:'Madagascar', SD:'Sudan', SS:'South Sudan',
  RW:'Rwanda', ML:'Mali', BF:'Burkina Faso', NE:'Niger', TD:'Chad', SO:'Somalia',
  FJ:'Fiji', PG:'Papua New Guinea', GU:'Guam', NC:'New Caledonia',
  PF:'French Polynesia', WS:'Samoa', TO:'Tonga', VU:'Vanuatu', SB:'Solomon Islands'
};

/* Which broad region a country sits in — the grouping worth seeing first
   when the per-country list is still mostly ones and twos. */
const REGION = {
  NA:'North America', LATAM:'Latin America', EU:'Europe', APAC:'Asia-Pacific',
  MEA:'Middle East & Africa', OTHER:'Elsewhere'
};
const CC_REGION = {};
const put = (region, ccs) => ccs.split(' ').forEach(c => CC_REGION[c] = region);
put('NA', 'US CA BM PM GL');
put('LATAM', 'MX BR AR CL CO PE VE EC BO PY UY GY SR GF FK CR PA GT SV HN NI BZ CU JM HT DO PR TT BB BS KY AW CW');
put('EU', 'GB IE FR DE ES PT IT NL BE CH AT SE NO DK FI IS PL CZ SK HU RO BG GR TR RU UA BY LT LV EE MD RS HR SI BA MK AL ME MT CY LU MC AD GI LI SM VA');
put('APAC', 'AU NZ JP KR KP CN HK TW MO SG MY ID TH VN PH IN PK BD LK NP MM KH LA MN KZ UZ KG TJ TM AF FJ PG GU NC PF WS TO VU SB');
put('MEA', 'IR IQ SA AE QA KW BH OM YE JO LB SY IL PS GE AM AZ ZA NG KE EG MA DZ TN LY GH ET TZ UG SN CI CM CD AO ZW ZM MZ BW NA MU RE MG SD SS RW ML BF NE TD SO');

/* A flag from the country code, with no flag data at all: the two letters
   shifted into the Unicode regional-indicator block. Renders as a flag on
   every platform that has them and as two boxed letters where it does not,
   which is still readable. */
function flag(cc){
  if (!cc || cc.length !== 2) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

/* A timezone string is only trustworthy in the shape we expect. Anything
   else is a broken client or someone poking at the API; either way it
   becomes "unknown" rather than landing in the database. */
const TZ_RX = /^[A-Za-z][A-Za-z0-9_+\-]{0,20}(\/[A-Za-z0-9_+\-]{1,20}){0,2}$/;

function cleanTz(tz){
  if (typeof tz !== 'string') return null;
  tz = tz.trim();
  if (!tz || tz.length > 64 || !TZ_RX.test(tz)) return null;
  // Confirm the runtime actually knows this zone — a name we cannot format
  // with is a name we cannot compute a local hour from either.
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0); }
  catch(e){ return null; }
  return tz;
}

/* Language tag, trimmed to the part worth keeping. "en-GB" tells you
   something; the full Accept-Language list with quality weights does not. */
function cleanLang(l){
  if (typeof l !== 'string') return null;
  const m = l.trim().split(',')[0].split(';')[0].trim();
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(m) ? m : null;
}

function countryOf(tz){
  if (!tz) return null;
  return ZONE_CC[tz.toLowerCase()] || null;
}
function countryName(cc){ return (cc && NAMES[cc]) || cc || 'Unknown'; }
function regionOf(cc){ return REGION[CC_REGION[cc]] || REGION.OTHER; }

/* The player's own clock at a given instant. Stored alongside the session
   so "when do people play" is a question about their evening, not about
   the server's — the whole point of collecting the zone. */
function localParts(ts, tz){
  if (!tz) return { hour:null, dow:null };
  try {
    const p = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour:'numeric', hour12:false, weekday:'short'
    }).formatToParts(new Date(ts));
    const hour = parseInt(p.find(x => x.type === 'hour').value, 10);
    const wk = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }[p.find(x => x.type === 'weekday').value];
    return { hour: (hour === 24 ? 0 : hour), dow: wk == null ? null : wk };
  } catch(e){ return { hour:null, dow:null }; }
}

/* Device class from the user agent. Three buckets, because "phone vs
   desktop" changes what you build next and "which of 400 Android models"
   does not. Nothing here is stored per-player beyond the bucket. */
function deviceOf(ua){
  ua = String(ua || '');
  if (!ua) return null;
  if (/\biPad\b/i.test(ua) || (/\bAndroid\b/i.test(ua) && !/\bMobile\b/i.test(ua)) || /\bTablet\b/i.test(ua)) return 'tablet';
  if (/\bMobi|iPhone|iPod|Android|Windows Phone\b/i.test(ua)) return 'phone';
  return 'desktop';
}

/* One call from the request side: everything derivable about where and on
   what, from headers the client volunteers plus the user agent. */
function contextOf(req){
  const h = (req && req.headers) || {};
  const tz = cleanTz(h['x-sb-tz']);
  const lang = cleanLang(h['x-sb-lang'] || h['accept-language']);
  const cc = countryOf(tz);
  return { tz, lang, country: cc, device: deviceOf(h['user-agent']) };
}

module.exports = { contextOf, cleanTz, cleanLang, countryOf, countryName,
                   regionOf, localParts, deviceOf, flag, REGION };
