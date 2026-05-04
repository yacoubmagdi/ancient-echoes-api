
UPDATE personas SET source_image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Pinedjem_I.jpg/500px-Pinedjem_I.jpg' WHERE id = '0c52670f-bd54-4391-96db-97b4e042ccea';
UPDATE personas SET source_image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Buste_de_Meremptah_%28la_Villette%2C_2023%29.jpg/500px-Buste_de_Meremptah_%28la_Villette%2C_2023%29.jpg' WHERE id = '4663961a-5f8a-427a-8cc4-006980692e71';
UPDATE personas SET source_image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Merneith_stele.jpg/500px-Merneith_stele.jpg' WHERE id = '674c355f-d6ee-44ef-b5a8-9f4f72a207fb';
UPDATE personas SET source_image_url = 'https://upload.wikimedia.org/wikipedia/commons/6/6d/Queen_Ahhotep%27s_coffin_from_Deir_el-Bahri_%28closeup%29.jpg' WHERE id = '919f6a93-c67e-4501-b802-588ace48a66c';
UPDATE personas SET source_image_url = 'https://upload.wikimedia.org/wikipedia/commons/5/51/BoneLabelQueenNeithhotep-BritishMuseum-August21-08.jpg' WHERE id = 'be4ddcab-708a-4db2-9259-de16590e83fb';
UPDATE personas SET source_image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Canopic_Smendes_Met.jpg/500px-Canopic_Smendes_Met.jpg' WHERE id = '7e600e6b-add6-43c8-883a-2089b0f352d8';
UPDATE personas SET source_image_url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Statue%2C_E_27135_%280320O7_01%29.jpg/500px-Statue%2C_E_27135_%280320O7_01%29.jpg' WHERE id = '45812f7b-08b8-4e56-bf40-937dc2c93516';
UPDATE personas SET source_image_url = 'https://upload.wikimedia.org/wikipedia/commons/0/03/Apis_Bakenranef_6_Mariette.jpg' WHERE id = '6985e28e-2c78-4bf0-a74d-35e5e6c770eb';

UPDATE personas SET source_image_url = NULL
WHERE source_image_url IN (
    SELECT source_image_url FROM personas WHERE source_image_url IS NOT NULL
    GROUP BY source_image_url HAVING COUNT(*) > 1
);
