SELECT 'contacts' as table_name, id, name, phone FROM contacts WHERE phone LIKE '%+5492644587992%'
UNION ALL
SELECT 'leads' as table_name, id, name, phone FROM leads WHERE phone LIKE '%+5492644587992%';
