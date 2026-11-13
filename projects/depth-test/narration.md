# نریشن و صدا

نریشن آزمایشی با صدای فارسی `fa_IR-amir-medium` در Piper به‌صورت محلی ساخته شد. زمان‌های زیر بازهٔ فایل هر جمله پس از برش سکوت ابتدایی و انتهایی‌اند. پلان اول با سرعت بیشتری اجرا شده تا پرسش و مکث کوتاه پیش از تغییر زاویه در سه ثانیه جا شوند. [مدل صدا و اطلاعات دادهٔ آموزش](https://huggingface.co/rhasspy/piper-voices/blob/v1.0.0/fa/fa_IR/amir/medium/MODEL_CARD)

| ثانیه | نریشن |
| --- | --- |
| ۰٫۲۵–۲٫۵۸۴ | اگه سطح دورتر آخر رسم بشه، کدوم دیده می‌شه؟ |
| ۳٫۵۰–۷٫۲۹۸ | از کنار نگاه کن. فیروزه‌ای نزدیک‌تره. کهربایی پشتشه. |
| ۸٫۱۰–۱۲٫۴۶۸ | برای همین نقطه، عمق هر سطح با عدد ذخیره‌شده مقایسه می‌شه. |
| ۱۳٫۱۰–۱۶٫۵۹۹ | نزدیک اول میاد. سطح دور عمق بیشتری داره و رد می‌شه. |
| ۱۸٫۰۰–۲۲٫۴۰۳ | حالا برعکس. نزدیک دیرتر میاد، ولی عدد کوچیک‌تر رو جایگزین می‌کنه. |
| ۲۳٫۳۰–۲۵٫۹۱۸ | توی این مثال، هر دو بار سطح نزدیک‌تر می‌مونه. |

صدای محیط و افکت‌ها در `build_audio.py` ساخته می‌شوند. حرکت دوربین از ۳٫۰۰ آغاز می‌شود، نشانهٔ عمق روی ۸٫۰۰ است، پذیرش و رد در ۱۳٫۷۰ و ۱۵٫۶۵ شنیده می‌شود، ترتیب معکوس در ۱۸٫۵۵ و ۲۰٫۵۵ و پاسخ در ۲۳٫۰۰ نشانهٔ صوتی دارند. بستر صدا در سراسر صحنه پیوسته است و با فاصلهٔ شنیداری زیر نریشن می‌ماند.

در `public/depth-test/audio` نسخهٔ `mix.wav`، لایهٔ کامل نریشن `narration.wav`، لایهٔ محیط و افکت `ambience-foley.wav`، هر جمله در فایل جدا و بازه‌های دقیق در `timings.json` قرار دارند. میکس WAV با طول ۲۸٫۰۰ ثانیه، استریو و ۴۸ کیلوهرتز، ‎−۱۴٫۱ LUFS و ‎−۲٫۰ dBTP است. نسخهٔ آزمایشی AAC با ۲۵۶ kbps مقدار ‎−۱۴٫۱۱ LUFS و ‎−۱٫۹۳ dBTP را ثبت کرد.

## بازسازی

برای ساخت دوبارهٔ صدا، از ریشهٔ پروژه فرمان‌های زیر را در PowerShell اجرا کن. گزینهٔ `--only` با نام جمله‌هایی مانند `hook` و `reveal` بازتولید را به همان جمله‌ها محدود می‌کند. گزینهٔ `--narration` میکس را از یک WAV نریشن ۲۸ ثانیه‌ای استریو PCM16 با نرخ ۴۸ کیلوهرتز بازسازی می‌کند.

```powershell
python -m pip install --target .tools/depth-piper piper-tts==1.8.0
$env:PYTHONPATH = (Resolve-Path .tools/depth-piper).Path
New-Item -ItemType Directory -Force .cache/depth-test/audio | Out-Null
$voiceUrl = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/fa/fa_IR/amir/medium'
curl.exe -fLsS "$voiceUrl/fa_IR-amir-medium.onnx" -o .cache/depth-test/audio/fa_IR-amir-medium.onnx
curl.exe -fLsS "$voiceUrl/fa_IR-amir-medium.onnx.json" -o .cache/depth-test/audio/fa_IR-amir-medium.onnx.json
python projects/depth-test/build_audio.py --model .cache/depth-test/audio/fa_IR-amir-medium.onnx
python projects/depth-test/build_audio.py --narration public/depth-test/audio/narration.wav
```
