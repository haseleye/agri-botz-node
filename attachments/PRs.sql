SELECT
    hou.name requisition_bu,
    prha.requisition_number requisition,
    (
        SELECT ppnf.display_name
        FROM per_person_names_f ppnf
        WHERE prha.preparer_id = ppnf.person_id
          AND SYSDATE BETWEEN ppnf.effective_start_date AND ppnf.effective_end_date
          AND UPPER(ppnf.name_type) = 'GLOBAL'
    ) entered_by,
    prha.document_status status,
    (
        SELECT DISTINCT esi.item_number
        FROM egp_system_items esi
        WHERE esi.inventory_item_id = prla.item_id
    ) item,
    prla.item_description,
    (
        SELECT category_name
        FROM egp_categories_vl ecv
        WHERE ecv.category_id = prla.category_id
    ) category_name,
    prla.quantity quantity,
    (
        SELECT iuom.unit_of_measure
        FROM inv_units_of_measure iuom
        WHERE iuom.uom_code = prla.uom_code
    ) uom,
    prla.unit_price,
    (prla.quantity * prla.unit_price) amount,
    (prha.attribute1 || '-' ||
        (SELECT ffl.description
         FROM fnd_flex_values_vl ffl
         WHERE ffl.flex_value = prha.attribute1
           AND ffl.value_category = 'MODON_GL_COST_CENTERS')) dept,
    prha.attribute3 material_request_no,
    prla.attribute1 item_specification,
    (
        SELECT location_name
        FROM hr_locations
        WHERE location_id = prla.deliver_to_location_id
    ) deliver_to_location,
    (
        SELECT ppnf.full_name
        FROM per_person_names_f ppnf
        WHERE prla.requester_id = ppnf.person_id
          AND SYSDATE BETWEEN ppnf.effective_start_date AND ppnf.effective_end_date
          AND UPPER(ppnf.name_type) = 'GLOBAL'
    ) requester,
    prla.line_status line_status,
    (
        SELECT hl.address_line_1 || ' ' || hl.address_line_3 || ' ' || hl.address_line_2 || ' ' || hl.town_or_city || ' ' ||
               (SELECT ffv.meaning
                FROM fnd_lookup_values_vl ffv
                WHERE hl.country = ffv.lookup_code
                  AND ffv.lookup_type = 'ORA_HRX_FR_COUNTRIES')
        FROM hr_locations hl
        WHERE location_id = prla.deliver_to_location_id
    ) deliver_to_address,
    TO_CHAR(prha.creation_date, 'dd-mon-yyyy', 'nls_date_language=American') creation_date,
    TO_CHAR(prha.approved_date, 'dd-mon-yyyy', 'nls_date_language=American') approved_date,
    pha.segment1 po_number,
    (
        SELECT ppnf.display_name
        FROM per_person_names_f ppnf
        WHERE ppnf.person_id = pha.agent_id
          AND SYSDATE BETWEEN ppnf.effective_start_date AND ppnf.effective_end_date
          AND UPPER(ppnf.name_type) = 'GLOBAL'
    ) buyer,
    (
        SELECT vendor_name
        FROM poz_suppliers_v
        WHERE vendor_id = prla.vendor_id
    ) supplier,
    prla.suggested_supplier_item_number supplier_item,
    prla.manufacturer_part_number manufacture_part_number,
    prla.manufacturer_name manufacture,
    prla.funds_status,
    prla.currency_code functional_currency,
    prla.cancel_reason,
    prla.return_reason
FROM
    por_requisition_headers_all prha,
    por_requisition_lines_all prla,
    po_headers_all pha,
    hr_operating_units hou
WHERE
    prha.requisition_header_id = prla.requisition_header_id
    AND prla.po_header_id = pha.po_header_id(+)
    AND hou.organization_id = prha.req_bu_id
ORDER BY
    prha.creation_date ASC
OFFSET :p_offset ROWS FETCH NEXT :p_limit ROWS ONLY