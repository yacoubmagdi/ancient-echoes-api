import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const description = 'آخن رع ستبن رع سبتاح (المعروف لاحقاً بـ مرنبتاح سبتاح) كان الملك قبل الأخير في الأسرة التاسعة عشرة من عصر الدولة الحديثة، اعتلى العرش وهو صغير السن نحو عام 1197 ق.م وظلّ نسب والده موضع جدل بين سيتي الثاني ومرنبتاح. حكمت باسمه فعلياً الملكة الوصيّة تاوسرت إلى جانب المستشار باي بسبب صغر سنه واعتلال صحته. توفي بعد نحو ست سنوات من حكمه ودُفن في وادي الملوك بالمقبرة KV47.';
const SRC = 'https://ar.wikipedia.org/wiki/%D8%B1%D9%85%D8%B3%D9%8A%D8%B3_%D8%B3%D8%A8%D8%AA%D8%A7%D8%AD';
const { error } = await s.from('personas').update({ description, source_image_url: SRC }).eq('id', 'acb384ee-d69d-495d-b041-690293f7f98c');
if (error) throw error;
console.log('OK ✅');
