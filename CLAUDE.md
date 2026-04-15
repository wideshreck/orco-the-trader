# Jarvis the Trader — Claude Code Guidance

Bu dosya Claude Code için **bağlayıcı** kurallar içerir. Her oturumda okunur, her yazım kararında uygulanır. Kural çelişirse: **güvenlik > doğruluk > kısalık > stil**.

---

## 0. Proje Nedir?

**Jarvis the Trader**: Terminal native (Ink tabanlı) çoklu-sağlayıcı AI chat CLI. Tek kullanıcılık, yerel çalışır, API anahtarlarını ortam değişkenlerinden okur. Gelecek hedef: tool-calling ile trading workflow'ları.

**Stack:**
- Runtime: Node 20+ ESM (`"type": "module"`)
- UI: React 18 + Ink 5 (terminal rendering)
- AI: Vercel AI SDK v6 (`ai` + `@ai-sdk/*` provider paketleri)
- Build: `tsc` → `dist/`, dev: `tsx`
- TypeScript: `strict: true`, `moduleResolution: "bundler"`

Kod bilerek minimal. Herhangi bir dosya 300 satırı geçmemeli.

---

## 1. ESM + TypeScript — Tuzaklar

### Import uzantıları
`moduleResolution: "bundler"` kullanıyoruz **ama** runtime Node ESM. Bu yüzden:

```ts
// DOĞRU — .ts kaynağı, .js uzantısıyla import
import { App } from './app.js';
import { streamChat } from './ai.js';

// YANLIŞ — runtime'da ERR_MODULE_NOT_FOUND
import { App } from './app';
import { App } from './app.ts';
```

**Kural:** Yerel importlarda **her zaman** `.js` uzantısı yaz (dosya gerçekte `.ts`/`.tsx` olsa bile). Bu kural derleme sonrası çalışma için zorunludur — unutma.

### Node built-in'leri
`node:` prefix kullan: `import fs from 'node:fs'`, `import path from 'node:path'`. Bare import (`'fs'`) yazma.

### `__dirname` yok
ESM'de `__dirname` yok. Gerekirse `import.meta.url` + `fileURLToPath` kullan. Ama config dosyaları için `os.homedir()` tercih et — zaten öyle yapıyoruz (`~/.jarvis/config.json`).

---

## 2. Ink / React — Terminal UI Kuralları

### Input handling tek yerde
`useInput` **sadece** `app.tsx` root component'inde. Alt component'ler callback prop ile haberleşir. İki yerde `useInput` → tuş çakışması, debug cehennemi.

### Focus state enum ile
Focus bir union type (`'input' | 'tools-bar' | 'model-picker' | ...`). Boolean flag cluster'ı açma (`isPickerOpen`, `isToolsPanelOpen` gibi). Her yeni odak = enum'a yeni değer.

### `exitOnCtrlC: false`
Ink'e Ctrl+C'yi biz yönetiyoruz diyoruz (`cli.tsx`). Stream iptal + çift Ctrl+C çıkış akışı `app.tsx`'te. **Bu sözleşmeyi koruma — yoksa streaming iptal edilemez.**

### Cleanup zorunlu
`useEffect` unmount'ta:
- Timer'lar: `clearTimeout`
- `AbortController`: `.abort()`
- Subscription'lar: kapat

Sızıntı bulursan **düzelt, not ekleme**.

### Alt-screen buffer
`cli.tsx` terminali alt-screen'e alıyor (`\x1b[?1049h`) ve çıkarken geri veriyor. Bu sırayı kırarsan kullanıcının shell geçmişi Jarvis çıktısıyla kirlenir. Dokunma.

---

## 3. AI SDK — Streaming ve Provider

### Tek streaming arayüzü
Tüm model çağrıları `src/ai.ts` içinden geçer. Component doğrudan `@ai-sdk/*` import **etmez**. Bu soyutlama tool-calling eklendiğinde kritik olacak.

### Abort sinyali zorunlu
`streamText` her zaman `abortSignal` ile çağrılır. Ctrl+C stream iptalini besliyor. Abort'suz stream yazma.

### Model resolution
Provider/model eşlemesi `src/models.ts`'deki `resolveModel` switch'inde. Yeni provider eklerken:
1. `package.json`'a `@ai-sdk/<provider>` ekle
2. `ProviderId` union'ına ekle
3. `resolveModel` switch'ine case ekle
4. `MODELS` listesine en az bir model gir (id, label, envKey)

**Adımlardan biri unutulursa TypeScript yakalar (`strict` sayesinde) — `as any` ile susturma.**

### Anahtar eksikliği bir **hata değil**, bir **durum**
`hasApiKey` kontrolü UI seviyesinde. Model resolve'da try/catch koyma — key olmadan da model picker listede göstermeli.

---

## 4. Hata Yönetimi

### Kullanıcıya dönen hatalar
- Kısa, eyleme çevrilebilir, **Türkçe** (UI dili TR).
- Stack trace UI'a dökme.
- Örnek: `ANTHROPIC_API_KEY bulunamadı. Ortam değişkenini set et ve tekrar dene.`

### İç hatalar
- `try/catch` **sadece** stream/IO sınırında (net, fs, fetch).
- İç helper'larda try/catch ile hatayı yutma — yukarı bırak.
- `error: any` yerine `error: unknown` + narrow et.

### Abort ≠ Hata
`err.name === 'AbortError'` kullanıcı iptalidir, `error: true` flag'i **basma**. Mevcut `handleSubmit` örnek.

---

## 5. Config ve Cache Dosyaları

| Ne | Nerede | TTL |
|----|--------|-----|
| Kullanıcı config | `~/.jarvis/config.json` | kalıcı |
| Model catalog cache | `~/.cache/jarvis/models.json` | 1 saat, stale fallback |

**Kurallar:**
- Config yazarken `mkdirSync(..., { recursive: true })` — dizin yoksa oluştur.
- Bozuk JSON → sessizce default'a dön (kullanıcı shell'i blokalama).
- Cache stale iken network hatası → stale veriyi döndür + `stale: true` flag'i UI'a bildir.

Proje dizinine config/cache yazma. Sadece home dir.

---

## 6. Dosya & Fonksiyon Limitleri

| Ölçü | Limit | Aşıldığında |
|------|-------|-------------|
| Dosya | 300 satır | Refactor (alt-component / helper modül). Aşma, özellik ekleme. |
| Fonksiyon | 50 satır | Yardımcıya böl. |
| Parametre | 5 | Object param'a çevir. |
| Nesting derinliği | 3 | Early return veya ayrı fonksiyon. |
| Cyclomatic complexity | sezgisel — switch 6 case'i aşıyorsa tablo lookup'a çevir | — |

250 satıra yaklaşınca **dur, refactor öner, sonra devam et**.

---

## 7. Kodlama Stili

### TypeScript
- `strict: true` — kapatma, bypass etme.
- `any` yasak. Kaçınılmazsa `unknown` + type guard.
- `as SomeType` assertion **sadece** runtime'da doğrulanmış JSON parse sonrası kabul edilir.
- `type` tercih, `interface` yalnızca extend gerekiyorsa.
- Enum yerine union literal types (`type Focus = 'input' | 'tools-bar'`).
- Null/undefined ayrımı: **undefined tercih**, null yalnızca JSON/DB sınırında.

### React / Ink
- Function component + hooks. Class component yok.
- `useState` lazy init: pahalı başlangıç (`loadConfig`) her zaman `useState(() => loadConfig())`.
- `useRef` state değişimine sebep olmayan mutable değerler için (timer, abort controller).
- `key` prop listede **stabil id** — index sadece gerçekten stabilse.
- Inline fonksiyonları memoize etme **zorla** (Ink re-render maliyeti düşük). Sorun görünürse ölç, sonra `useCallback`.

### Naming
- React bileşenleri `PascalCase`, hook'lar `useX`, tipler `PascalCase`, değişkenler `camelCase`.
- Dosya adları `kebab-case.ts` **değil**, domain kelimesiyle: `models.ts`, `catalog.ts`, `app.tsx`. Mevcut convention'u koru.

### Yorumlar
- Varsayılan: **yorum yok**. İsim zaten açıklar.
- Yorum yaz **sadece şu durumlarda**: gizli invariant, Ink/ANSI eşiği (`\x1b[?1049h` gibi), bug workaround, zamana bağlı karar (`// models.dev TTL 1h`).
- Asla: "TODO: daha sonra", "bu fonksiyon X yapar", JSDoc blokları.

---

## 8. Doğrulama — "Bitti" Demeden Önce Çalıştır

| Komut | Ne zaman |
|-------|----------|
| `npm run build` | Her yapısal değişiklikten sonra, PR öncesi zorunlu |
| `npm run dev` | UI değişikliklerinde elle deneme |
| `node --input-type=module -e "import('./dist/cli.js')"` | Build çıktısının ESM'de çözülmesini doğrula |

**"TypeScript derledi" ≠ "çalışıyor".** UI değişikliğinde `npm run dev` ile en az şu akışları dene:
1. Mesaj gönder + stream'i izle
2. Ctrl+C ile stream'i iptal et (tek basış)
3. Çift Ctrl+C ile çık
4. `/model` ile picker aç, seç, onayla
5. `/clear` ile mesajları temizle
6. Geçersiz env ile başlat (key eksik senaryosu)

Bir akış denenmediyse, "çalışıyor" **deme**.

Lint/format aracı henüz yok. Kurmak istiyorsan önce sor.

---

## 9. Commit Hijyeni

- **Atomik commit**: bir iş, bir commit. "refactor + feature + docs" commit'i reddet.
- Mesaj formatı: `domain: kısa özet` (örn. `ai: add abort propagation`, `ui: fix focus leak on esc`).
- Gövde gerekliyse: **neden** yaz, **ne**yi diff zaten gösteriyor.
- İstenmedikçe `Co-Authored-By` ekleme.
- İstenmedikçe `--no-verify` kullanma. Hook düştüyse root cause'u çöz.
- **Asla** `git push --force`, `git reset --hard`, `git branch -D` kullanma — kullanıcı açıkça istemedikçe.

---

## 10. Kırmızı Çizgiler (Asla Yapma)

- `any` kullanma, tipi `@ts-ignore`/`@ts-expect-error` ile susturma.
- İç importlarda `.js` uzantısını atla.
- `useInput`'u root dışında çağır.
- Component içinde doğrudan `@ai-sdk/*` import et.
- Streaming'i `AbortSignal` olmadan başlat.
- Kullanıcının shell geçmişine (stdout) debug log düşür (`console.log` prod'a bırakma — Ink render'ını bozar).
- Proje kökünü config/cache dizini olarak kullan.
- Test silerek build yeşile boyama (test henüz yok ama ilke önceden).
- Dosya içinde kullanılmamış import/variable'a `_` prefix ile kamufle — **sil**.
- Yeni `.md` dosyası oluştur (kullanıcı açıkça istemedikçe).

---

## 11. Mimari Katmanlar (Şu Anki + Hedef)

```
cli.tsx      → render bootstrap, alt-screen buffer
 └─ app.tsx  → UI state, input handling, komutlar (/model, /clear)
     ├─ models.ts   → provider/model registry + resolveModel
     ├─ ai.ts       → streaming soyutlaması (UI buna bağlı, SDK'ya bağlı değil)
     ├─ config.ts   → persistent user config
     └─ catalog.ts  → models.dev cache (1h TTL + stale fallback)
```

**Bağımlılık yönü:** UI → ai.ts → models.ts → SDK. Ters yönlü import yasak. `models.ts` Ink import etmez. `ai.ts` React import etmez.

Tool-calling eklenirken:
- `src/tools/` dizini aç, her tool ayrı dosya.
- Tool registry `src/tools/index.ts`, `ai.ts` sadece registry import eder.
- UI tool çıktısını render eder, tool'u **çağırmaz**.

Bu yapı değişikliği gerektiren bir feature önerirken önce tasarımı yaz, onay bekle.

---

## 12. Gelecek İçin Boşluklar

Bunlar şu an eksik, eklerken uyar/yapma:

- Test altyapısı yok (Vitest öneri, ama önce sor).
- Logger yok (`console.*` Ink'i bozar — Ink `<Text>` veya stderr'e yaz).
- Yapılandırma doğrulaması yok (config.json bozulursa default'a düşer, bu şimdilik kabul).
- Tool-calling yok, sistem prompt'u yok, memory yok.

---

## 13. İletişim Tonu (Claude → Kullanıcı)

- Türkçe konuş. Teknik terimler İngilizce kalabilir (stream, abort, focus).
- Emoji kullanma (kullanıcı istemedikçe).
- Özet paragraflar yazma — doğrudan cevap ver.
- İş bitince: tek cümle "ne değişti" + varsa "sırada ne var". Başka bir şey yazma.
- Plan yap, onay bekle, sonra kod yaz — kullanıcı açıkça "direkt yaz" demedikçe.

---

Bu dosyayı güncel tut. Bir kural ihlal edildiğinde (ve kullanıcı düzeltme yaptığında) ilgili maddeye **neden**ini ekle. Kurallar gerekçesiz yazılmaz.
