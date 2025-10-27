-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.game_stats (
  id integer NOT NULL DEFAULT nextval('game_stats_id_seq'::regclass),
  team_abbr character varying NOT NULL,
  week integer NOT NULL,
  season integer NOT NULL,
  opponent character varying,
  pass_completions integer DEFAULT 0,
  pass_attempts integer DEFAULT 0,
  pass_yards integer DEFAULT 0,
  pass_tds integer DEFAULT 0,
  interceptions integer DEFAULT 0,
  sacks integer DEFAULT 0,
  sack_yards integer DEFAULT 0,
  qbr numeric DEFAULT 0,
  rush_yards integer DEFAULT 0,
  rush_tds integer DEFAULT 0,
  longest_play integer DEFAULT 0,
  fumbles integer DEFAULT 0,
  fumbles_lost integer DEFAULT 0,
  defensive_td integer DEFAULT 0,
  safety integer DEFAULT 0,
  game_ending_fumble integer DEFAULT 0,
  game_winning_drive integer DEFAULT 0,
  benching integer DEFAULT 0,
  completion_percent numeric DEFAULT 0,
  net_pass_yards integer DEFAULT 0,
  total_tds integer DEFAULT 0,
  final_score integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT game_stats_pkey PRIMARY KEY (id)
);
CREATE TABLE public.league_settings (
  id integer NOT NULL DEFAULT nextval('league_settings_id_seq'::regclass),
  current_week integer NOT NULL DEFAULT 1,
  locked_weeks ARRAY DEFAULT '{}'::integer[],
  season integer NOT NULL DEFAULT 2025,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT league_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.lineups (
  id integer NOT NULL DEFAULT nextval('lineups_id_seq'::regclass),
  team_id integer NOT NULL,
  week integer NOT NULL,
  active_qbs ARRAY NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lineups_pkey PRIMARY KEY (id),
  CONSTRAINT lineups_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id)
);
CREATE TABLE public.matchups (
  id integer NOT NULL DEFAULT nextval('matchups_id_seq'::regclass),
  week integer NOT NULL,
  team1_id integer NOT NULL,
  team2_id integer NOT NULL,
  team1_score integer DEFAULT 0,
  team2_score integer DEFAULT 0,
  winner_id integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT matchups_pkey PRIMARY KEY (id),
  CONSTRAINT matchups_team1_id_fkey FOREIGN KEY (team1_id) REFERENCES public.teams(id),
  CONSTRAINT matchups_team2_id_fkey FOREIGN KEY (team2_id) REFERENCES public.teams(id),
  CONSTRAINT matchups_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.teams(id)
);
CREATE TABLE public.teams (
  id integer NOT NULL DEFAULT nextval('teams_id_seq'::regclass),
  name character varying NOT NULL UNIQUE,
  rosters ARRAY NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT teams_pkey PRIMARY KEY (id)
);