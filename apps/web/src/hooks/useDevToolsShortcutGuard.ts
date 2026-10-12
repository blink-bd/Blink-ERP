import { useEffect } from 'react';

/**
 * حارس اختصارات أدوات المطوّر (DevTools).
 *
 * سبب وجود هذا الملف:
 * قارئ الباركود (Barcode Scanner) يعمل كلوحة مفاتيح (HID Keyboard)، وفي بعض
 * الإعدادات يرسل مع الرقم المقروء مفاتيح إضافية غير مقصودة مثل F12 أو
 * Ctrl+Shift+I — وهي نفس اختصارات فتح أدوات المطوّر. النتيجة أن لوحة
 * Elements / DevTools تُفتح فجأة أمام التاجر أثناء البيع في صفحة نقطة البيع (POS).
 *
 * الحل هنا: مستمع keydown على window في مرحلة الالتقاط (capture) يمنع هذه
 * الاختصارات تحديداً فقط، قبل أن تصل إلى أي عنصر آخر في الصفحة.
 *
 * ملاحظات مهمة:
 * - لا يتم منع مفتاح Enter إطلاقاً، لأن Enter مطلوب في صفحة POS للبحث
 *   وإضافة المنتج إلى السلة (قارئ الباركود يرسله كـ Suffix).
 * - لا يؤثر الحارس على الكتابة العادية ولا على إدخال أرقام الباركود،
 *   فهو يمنع تركيبات المفاتيح المذكورة أدناه فقط ويترك ما عداها يمر كالمعتاد.
 * - الحارس يعمل في الإنتاج فقط، ويُتجاهل أثناء التطوير حتى تبقى أدوات
 *   المطوّر متاحة للمبرمج.
 *
 * الحل الجذري المكمّل من جهة الجهاز: اضبط قارئ الباركود على
 * Suffix = Enter فقط، وعطّل الـ Prefix وخاصية Function Key Emulation.
 */

// حروف اختصارات الفحص: Ctrl/Cmd + Shift + (I أو J أو C)
const INSPECT_KEYS = ['i', 'j', 'c'];

export function useDevToolsShortcutGuard() {
  useEffect(() => {
    // أثناء التطوير نترك أدوات المطوّر تعمل بشكل طبيعي.
    const isDevEnvironment = Boolean((import.meta as any).env?.DEV);
    if (isDevEnvironment) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = (event.key || '').toLowerCase();
      const ctrlOrCmd = event.ctrlKey || event.metaKey;

      // F12: المفتاح الذي يرسله بعض قارئات الباركود بالخطأ مع الرقم المقروء.
      const isF12 = key === 'f12';

      // Ctrl/Cmd + Shift + I / J / C : فتح أدوات المطوّر أو لوحة Elements والـ Console.
      const isInspectShortcut = ctrlOrCmd && event.shiftKey && INSPECT_KEYS.includes(key);

      // Ctrl/Cmd + U : عرض مصدر الصفحة (View Source).
      const isViewSourceShortcut = ctrlOrCmd && !event.shiftKey && key === 'u';

      if (isF12 || isInspectShortcut || isViewSourceShortcut) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    // مرحلة الالتقاط (capture = true) حتى نوقف الاختصار قبل وصوله لأي حقل إدخال.
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
