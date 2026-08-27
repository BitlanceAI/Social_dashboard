
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://dfkkiyutfzxfdhorfxtp.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma2tpeXV0Znp4ZmRob3JmeHRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3MTI4MTIsImV4cCI6MjEwMzI4ODgxMn0.0yorrU1zEASrE205EU1Gg-oTc6rlKeBJH9CqyUxntxw'

export const supabase = createClient(supabaseUrl, supabaseKey)
