# Implementation Plan 4: Recipe Importer & Substitution Logic

## Overview
Implementing the "Planning Mode" hero feature that translates recipes into shoppable US lists.

## Tasks
1. **Recipe Input Handler**
   - [x] Build input field for dish names or recipe URLs.
   - [x] Implement AI extraction prompt (e.g. "Extract ingredients for [Dish] and map to US staples").

2. **Substitution Engine**
   - [x] Integrate with Gemini 2.5 Flash to generate:
     - Closest US Brand/Item.
     - Match Score (%).
     - Preparation Tip (Cultural context).
   - [x] `lib/gemini.ts` — REST-based client, no SDK needed for RN.
   - [ ] Implement "Value vs Quality" toggle logic (UI only for now).

3. **List Management**
   - [x] Create/Update lists in Supabase.
   - [x] Full ListScreen with CRUD (create/delete lists, toggle/delete items).
   - [x] DB migration: added name, brand, category, notes, is_checked columns.
   - [x] RLS policies enabled for all tables.
   - [ ] Implement "Export to Instacart" deep-link functionality.
