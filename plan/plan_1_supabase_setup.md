# Implementation Plan 1: Project Initialization & Supabase Setup

## Overview
This phase focus on setting up the backend infrastructure and the foundational project structure for HomeCart.

## Tasks
17. **Infrastructure Setup**
   - [x] Initialize Supabase project.
   - [x] Configure Auth providers (Google, Apple, Facebook).
   - [x] Enable Supabase Realtime for `shopping_lists` table.

2. **Database Schema**
   - [x] Create `profiles` table:
     - `id` (uuid, primary key)
     - `home_country` (text)
     - `preferred_language` (text)
     - `dietary_preferences` (text[])
   - [x] Create `shopping_lists` table:
     - `id` (uuid, primary key)
     - `user_id` (uuid, foreign key to profiles)
     - `title` (text)
     - `status` (enum: planning, shopping, completed)
   - [x] Create `list_items` table:
     - `id` (uuid, primary key)
     - `list_id` (uuid, foreign key)
     - `original_ingredient` (text)
     - `us_equivalent_brand` (text)
     - `match_score` (int)
     - `aisle_location` (text)
     - `is_verified` (boolean)

3. **Frontend Scaffold**
   - [x] Initialize mobile project (e.g., React Native or Expo).
   - [x] Install Supabase client SDK.
   - [x] Configure environment variables.
