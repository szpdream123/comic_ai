-- Add normalized Chinese comments for every project-owned table and column.
-- ASCII-only SQL source: Chinese text is represented with PostgreSQL Unicode escapes.
-- This migration updates catalog comments only; it does not change schema or data.

DO $$
DECLARE
  table_prefix text := U&'\4E1A\52A1\6570\636E\8868\FF1A';
  table_suffix text := U&'\3002\672C\8868\7528\4E8E\4FDD\5B58\6240\5C5E\4E1A\52A1\5BF9\8C61\7684\6301\4E45\5316\6570\636E\3001\79DF\6237\5F52\5C5E\3001\751F\547D\5468\671F\72B6\6001\548C\5BA1\8BA1\8FFD\8E2A\4FE1\606F\3002\8BF7\7ED3\5408\5B57\6BB5\6CE8\91CA\3001\5916\952E\7EA6\675F\3001\68C0\67E5\7EA6\675F\548C\4E1A\52A1\4EE3\7801\7406\89E3\5177\4F53\542B\4E49\3002';
  column_prefix text := U&'\4E1A\52A1\5B57\6BB5\FF1A';
  column_middle text := U&'\3002\6240\5C5E\8868\FF1A';
  column_name_label text := U&'\3002\5B57\6BB5\540D\FF1A';
  column_type_label text := U&'\3002\6570\636E\7C7B\578B\FF1A';
  nullable_yes text := U&'\3002\5141\8BB8\4E3A\7A7A\FF0C\8868\793A\8BE5\4E1A\52A1\4FE1\606F\5728\90E8\5206\6D41\7A0B\3001\8349\7A3F\72B6\6001\6216\5386\53F2\6570\636E\4E2D\53EF\4EE5\6682\7F3A\3002';
  nullable_no text := U&'\3002\4E0D\80FD\4E3A\7A7A\FF0C\662F\8BE5\4E1A\52A1\8BB0\5F55\6210\7ACB\6240\5FC5\987B\5177\5907\7684\6570\636E\3002';
  default_label text := U&'\9ED8\8BA4\503C\FF1A';
  no_default text := U&'\65E0\6570\636E\5E93\9ED8\8BA4\503C\FF0C\5199\5165\65F6\901A\5E38\7531\4E1A\52A1\4EE3\7801\6216\8FC1\79FB\811A\672C\663E\5F0F\63D0\4F9B\3002';
  column_suffix text := U&'\7528\4E8E\6570\636E\5E93\5B57\5178\3001\540E\53F0\6392\67E5\3001\6570\636E\6CBB\7406\548C\4EA4\63A5\8BF4\660E\3002';
  r record;
  c record;
  column_comment text;
BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  LOOP
    EXECUTE format(
      'COMMENT ON TABLE %I.%I IS %L',
      r.table_schema,
      r.table_name,
      table_prefix || r.table_name || table_suffix
    );

    FOR c IN
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = r.table_schema
        AND table_name = r.table_name
      ORDER BY ordinal_position
    LOOP
      column_comment :=
        column_prefix || c.column_name ||
        column_middle || r.table_name ||
        column_name_label || c.column_name ||
        column_type_label || c.data_type ||
        CASE WHEN c.is_nullable = 'YES' THEN nullable_yes ELSE nullable_no END ||
        default_label ||
        COALESCE(c.column_default || U&'\3002', no_default) ||
        column_suffix;

      EXECUTE format(
        'COMMENT ON COLUMN %I.%I.%I IS %L',
        r.table_schema,
        r.table_name,
        c.column_name,
        column_comment
      );
    END LOOP;
  END LOOP;
END $$;
