import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./services/supabase";

const STORAGE_KEY = "simple-football-tournament-v2";

const emptyTournament = {
  name: "Min turnering",
  groups: {
    A: [],
    B: []
  },
  matches: []
};

function createTeam(name, group = "A", logo = "") {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    group,
    logo
  };
}

function createMatch(homeTeamId, awayTeamId) {
  return {
    id: crypto.randomUUID(),
    homeTeamId,
    awayTeamId,
    homeGoals: "",
    awayGoals: ""
  };
}

function loadTournament() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : emptyTournament;
  } catch {
    return emptyTournament;
  }
}

function calculateStandings(teams, matches) {
  const rows = teams.map((team) => ({
    id: team.id,
    name: team.name,
    group: team.group,
    logo: team.logo,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0
  }));

  const rowMap = new Map(rows.map((row) => [row.id, row]));

  matches.forEach((match) => {
    if (match.homeGoals === "" || match.awayGoals === "") return;

    const home = rowMap.get(match.homeTeamId);
    const away = rowMap.get(match.awayTeamId);
    if (!home || !away) return;

    const homeGoals = Number(match.homeGoals);
    const awayGoals = Number(match.awayGoals);

    home.played += 1;
    away.played += 1;

    home.goalsFor += homeGoals;
    home.goalsAgainst += awayGoals;

    away.goalsFor += awayGoals;
    away.goalsAgainst += homeGoals;

    if (homeGoals > awayGoals) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (homeGoals < awayGoals) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  });

  return rows
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.goalDifference - a.goalDifference ||
        b.goalsFor - a.goalsFor ||
        a.name.localeCompare(b.name)
    );
}

export default function App() {
  const [tournament, setTournament] = useState(loadTournament);
  const [viewMode, setViewMode] = useState("spectator");
  const [teamName, setTeamName] = useState("");
  const [teamLogo, setTeamLogo] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("A");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [homeGoals, setHomeGoals] = useState("");
  const [awayGoals, setAwayGoals] = useState("");
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [adminCode, setAdminCode] = useState("");

useEffect(() => {
  loadData();
}, []);

useEffect(() => {
  async function loadSession() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);

    if (data.session?.user?.id) {
      await checkAdmin(data.session.user.id);
    }
  }

  loadSession();

  const { data: listener } = supabase.auth.onAuthStateChange(
    async (_event, newSession) => {
      setSession(newSession);

      if (newSession?.user?.id) {
        await checkAdmin(newSession.user.id);
      } else {
        setIsAdmin(false);
      }
    }
  );

  return () => {
    listener.subscription.unsubscribe();
  };
}, []);
 
async function loadData() {
  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("*");

  if (teamsError) {
    console.error("Teams error:", teamsError);
    return;
  }

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("*")
    .order("match_order", { ascending: true });

  if (matchesError) {
    console.error("Matches error:", matchesError);
    return;
  }

  const groupA = teams
    .filter((x) => x.group_name === "A")
    .map((x) => ({
      id: x.id,
      name: x.name,
      group: x.group_name,
      logo: x.logo_url || ""
    }));

  const groupB = teams
    .filter((x) => x.group_name === "B")
    .map((x) => ({
      id: x.id,
      name: x.name,
      group: x.group_name,
      logo: x.logo_url || ""
    }));

  const mappedMatches = matches.map((x) => ({
    id: x.id,
    homeTeamId: x.home_team_id,
    awayTeamId: x.away_team_id,
    homeGoals: x.home_score ?? "",
    awayGoals: x.away_score ?? ""
  }));

  setTournament((current) => ({
    ...current,
    groups: {
      A: groupA,
      B: groupB
    },
    matches: mappedMatches
  }));
}

const allTeams = useMemo(
  () => [...tournament.groups.A, ...tournament.groups.B],
  [tournament.groups]
);

const groupMatches = (group) => {
  const teamIds = new Set(
    tournament.groups[group].map((team) => team.id)
  );

  return tournament.matches.filter(
    (match) =>
      teamIds.has(match.homeTeamId) &&
      teamIds.has(match.awayTeamId)
  );
};

const standingsA = useMemo(
  () => calculateStandings(tournament.groups.A, groupMatches("A")),
  [tournament]
);

const standingsB = useMemo(
  () => calculateStandings(tournament.groups.B, groupMatches("B")),
  [tournament]
);

const qualifiers = useMemo(() => {
  const a1 = standingsA[0];
  const a2 = standingsA[1];
  const b1 = standingsB[0];
  const b2 = standingsB[1];

  return {
    a1,
    a2,
    b1,
    b2,
    semifinals: [
      { name: "Semifinal 1", home: a1, away: b2 },
      { name: "Semifinal 2", home: b1, away: a2 }
    ]
  };
}, [standingsA, standingsB]);

//Admin 
async function checkAdmin(userId) {
  const { data, error } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Admin check error:", error);
    setIsAdmin(false);
    return;
  }

  const admin = !!data;
  setIsAdmin(admin);

  if (admin) {
    setViewMode("admin");
  }
}
// async function login() {
//   if (!loginEmail.trim()) return;

//   const { error } = await supabase.auth.signInWithOtp({
//     email: loginEmail,
//     options: {
//       // emailRedirectTo: "https://niklund9298.github.io/football-app/"
//        emailRedirectTo: "http://localhost:5173/football-app/"
//     }
//   });

//   if (error) {
//     alert(error.message);
//     return;
//   }

//   alert("Login-länk skickad. Vänta på mailet och klicka bara en gång.");
// }
async function createSemiFinals() {
  const a1 = standingsA[0];
  const a2 = standingsA[1];
  const b1 = standingsB[0];
  const b2 = standingsB[1];

  if (!a1 || !a2 || !b1 || !b2) {
    alert("Alla grupper måste ha minst två lag.");
    return;
  }

  const tournamentId = "8f0b89db-4db8-4e71-84e4-40cefa96fdf9";

  await supabase
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("stage", "SEMIFINAL");

  const { error } = await supabase.from("matches").insert([
    {
      tournament_id: tournamentId,
      home_team_id: a1.id,
      away_team_id: b2.id,
      home_score: null,
      away_score: null,
      played: false,
      stage: "SEMIFINAL",
      match_type: "SEMIFINAL",
      match_order: 100
    },
    {
      tournament_id: tournamentId,
      home_team_id: b1.id,
      away_team_id: a2.id,
      home_score: null,
      away_score: null,
      played: false,
      stage: "SEMIFINAL",
      match_type: "SEMIFINAL",
      match_order: 101
    }
  ]);

  if (error) {
    console.error(error);
    alert("Kunde inte skapa semifinaler.");
    return;
  }

  await loadData();
}

function login() {
  console.log("LOGIN CLICKED:", adminCode);

  if (adminCode.trim() === "1234") {
    setIsAdmin(true);
    setViewMode("admin");
    return;
  }

  alert("Fel kod.");
}

async function logout() {
  await supabase.auth.signOut();
  setIsAdmin(false);
}

function goToAdmin() {
  setViewMode("admin");
}

function goToSpectator() {
  setViewMode("spectator");
}
function getTeamName(teamId) {
  return allTeams.find((team) => team.id === teamId)?.name ?? "Okänt lag";
}
 async function addTeam() {
  console.log("ADD TEAM CLICKED");

  if (!teamName.trim()) {
    console.log("No team name");
    return;
  }

  const payload = {
    tournament_id: "8f0b89db-4db8-4e71-84e4-40cefa96fdf9",
    name: teamName,
    logo_url: teamLogo || null,
    group_name: selectedGroup
  };

  console.log("INSERT PAYLOAD:", payload);

  const { data, error } = await supabase
    .from("teams")
    .insert(payload)
    .select()
    .single();

  console.log("CREATE TEAM DATA:", data);
  console.log("CREATE TEAM ERROR:", error);

  if (error) {
    alert(error.message);
    return;
  }

  await loadData();

  setTeamName("");
  setTeamLogo("");
}
 async function removeTeam(group, teamId) {
  const { error } = await supabase
    .from("teams")
    .delete()
    .eq("id", teamId);

  if (error) {
    console.error("Could not delete team:", error);
    alert("Kunde inte ta bort lag.");
    return;
  }

  setTournament((current) => ({
    ...current,
    groups: {
      ...current.groups,
      [group]: current.groups[group].filter((team) => team.id !== teamId)
    },
    matches: current.matches.filter(
      (match) =>
        match.homeTeamId !== teamId &&
        match.awayTeamId !== teamId
    )
  }));
}

 async function renameTeam(group, teamId, field, value) {
  const columnMap = {
    name: "name",
    logo: "logo_url",
    group: "group_name"
  };

  const dbColumn = columnMap[field];

  const { error } = await supabase
    .from("teams")
    .update({
      [dbColumn]: value
    })
    .eq("id", teamId);

  if (error) {
    console.error("Could not update team:", error);
    alert("Kunde inte uppdatera lag.");
    return;
  }

  setTournament((current) => ({
    ...current,
    groups: {
      ...current.groups,
      [group]: current.groups[group].map((team) =>
        team.id === teamId
          ? { ...team, [field]: value }
          : team
      )
    }
  }));
}

  async function addMatch() {
  if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId)
    return;

  const { data, error } = await supabase
    .from("matches")
    .insert({
      tournament_id: "8f0b89db-4db8-4e71-84e4-40cefa96fdf9",
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      home_score: homeGoals || null,
      away_score: awayGoals || null,
      played: false,
      match_type: "GROUP"
    })
    .select()
    .single();

  if (error) {
    console.error("Could not create match:", error);
    alert("Kunde inte skapa match.");
    return;
  }

  setTournament((current) => ({
    ...current,
    matches: [
      ...current.matches,
      {
        id: data.id,
        homeTeamId: data.home_team_id,
        awayTeamId: data.away_team_id,
        homeGoals: data.home_score ?? "",
        awayGoals: data.away_score ?? ""
      }
    ]
  }));

  setHomeTeamId("");
  setAwayTeamId("");
  setHomeGoals("");
  setAwayGoals("");
}

 async function generateGroupMatches() {
  const matchesToInsert = [];
  let matchOrder = 1;

  ["A", "B"].forEach((group) => {
    const teams = tournament.groups[group];

    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        matchesToInsert.push({
          tournament_id: "8f0b89db-4db8-4e71-84e4-40cefa96fdf9",
          home_team_id: teams[i].id,
          away_team_id: teams[j].id,
          home_score: null,
          away_score: null,
          played: false,
          match_type: "GROUP",
          group_name: group,
          match_order: matchOrder
        });

        matchOrder += 1;
      }
    }
  });

  const { data, error } = await supabase
    .from("matches")
    .insert(matchesToInsert)
    .select();

  if (error) {
    console.error("Could not create matches:", error);
    alert("Kunde inte skapa matcher.");
    return;
  }

const mappedMatches = matches.map((x) => ({
  id: x.id,
  homeTeamId: x.home_team_id,
  awayTeamId: x.away_team_id,
  homeGoals: x.home_score ?? "",
  awayGoals: x.away_score ?? "",
  stage: x.stage || x.match_type || "GROUP",
  winnerTeamId: x.winner_team_id || null
}));

  setTournament((current) => ({
    ...current,
    matches: mappedMatches
  }));
}

  async function updateMatch(matchId, field, value) {
  setTournament((current) => ({
    ...current,
    matches: current.matches.map((match) =>
      match.id === matchId ? { ...match, [field]: value } : match
    )
  }));

  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) return;

  const updatedMatch = {
    ...match,
    [field]: value
  };

  const { error } = await supabase
    .from("matches")
    .update({
      home_score:
        updatedMatch.homeGoals === "" ? null : Number(updatedMatch.homeGoals),
      away_score:
        updatedMatch.awayGoals === "" ? null : Number(updatedMatch.awayGoals),
      played:
        updatedMatch.homeGoals !== "" && updatedMatch.awayGoals !== ""
    })
    .eq("id", matchId);

  if (error) {
    console.error("Could not update match:", error);
    alert("Kunde inte spara resultatet.");
  }
}

 async function removeMatch(matchId) {
  const { error } = await supabase
    .from("matches")
    .delete()
    .eq("id", matchId);

  if (error) {
    console.error(error);
    alert("Kunde inte ta bort match.");
    return;
  }

  setTournament((current) => ({
    ...current,
    matches: current.matches.filter(
      (match) => match.id !== matchId
    )
  }));
}
 async function importExcel(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);

    const tournamentId = "8f0b89db-4db8-4e71-84e4-40cefa96fdf9";

    const cleanName = (value) =>
      String(value || "")
        .split(" ")
        .filter(Boolean)
        .join(" ")
        .trim();

    const normalizeName = (value) => {
      let text = cleanName(value).toUpperCase();
      if (text.endsWith(" FC")) text = text.slice(0, -3);

      return text
        .split("")
        .filter((char) =>
          "ABCDEFGHIJKLMNOPQRSTUVWXYZÅÄÖÉÈÜ'´0123456789".includes(char)
        )
        .join("");
    };

    const splitMatchText = (value) => {
      const text = cleanName(value);
      const upper = text.toUpperCase();
      const index = upper.indexOf(" VS ");

      if (index === -1) return [];

      return [
        cleanName(text.slice(0, index)),
        cleanName(text.slice(index + 4))
      ];
    };

    const getSheetRows = (sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return [];

      return XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: ""
      });
    };

    const readTeamsFromGroupSheet = (sheetName, group) => {
      const rows = getSheetRows(sheetName);

      return rows
        .slice(1)
        .map((row) => cleanName(row[1]))
        .filter((name) => name && !name.toUpperCase().includes("GRUPP"))
        .map((name) => ({
          tournament_id: tournamentId,
          name,
          logo_url: null,
          group_name: group
        }));
    };

    const teamsToInsert = [
      ...readTeamsFromGroupSheet("Blad1", "A"),
      ...readTeamsFromGroupSheet("Blad2", "B")
    ];

    const { error: deleteMatchesError } = await supabase
      .from("matches")
      .delete()
      .eq("tournament_id", tournamentId);

    if (deleteMatchesError) {
      console.error(deleteMatchesError);
      alert("Kunde inte rensa gamla matcher.");
      return;
    }

    const { error: deleteTeamsError } = await supabase
      .from("teams")
      .delete()
      .eq("tournament_id", tournamentId);

    if (deleteTeamsError) {
      console.error(deleteTeamsError);
      alert("Kunde inte rensa gamla lag.");
      return;
    }

    const { data: insertedTeams, error: insertTeamsError } = await supabase
      .from("teams")
      .insert(teamsToInsert)
      .select();

    if (insertTeamsError) {
      console.error(insertTeamsError);
      alert("Kunde inte importera lag.");
      return;
    }

    const findTeam = (rawName) => {
      const normalized = normalizeName(rawName);

      let team = insertedTeams.find(
        (item) => normalizeName(item.name) === normalized
      );

      if (!team) {
        team = insertedTeams.find(
          (item) =>
            normalizeName(item.name).includes(normalized) ||
            normalized.includes(normalizeName(item.name))
        );
      }

      return team;
    };

    const scheduleRows = getSheetRows("Blad3");
    const matchesToInsert = [];

    scheduleRows.slice(1).forEach((row) => {
      const scheduleText = cleanName(row[0]);
      const matchText = cleanName(row[1]);
      const matchNumber = Number(row[4]);

      if (!matchText || !matchNumber || matchNumber > 20) return;

      const group = scheduleText.toUpperCase().includes("GRUPP B")
        ? "B"
        : "A";

      const parts = splitMatchText(matchText);
      if (parts.length !== 2) return;

      const homeTeam = findTeam(parts[0]);
      const awayTeam = findTeam(parts[1]);

      if (!homeTeam || !awayTeam) {
        console.warn("Could not find team for match:", matchText);
        return;
      }

      matchesToInsert.push({
        tournament_id: tournamentId,
        home_team_id: homeTeam.id,
        away_team_id: awayTeam.id,
        home_score: null,
        away_score: null,
        played: false,
        match_type: "GROUP",
        group_name: group,
        match_order: matchNumber
      });
    });

    const { error: insertMatchesError } = await supabase
      .from("matches")
      .insert(matchesToInsert);

    if (insertMatchesError) {
      console.error(insertMatchesError);
      alert("Kunde inte importera matcher.");
      return;
    }

    await loadData();

    event.target.value = "";
    alert("Excel-importen är klar!");
  } catch (error) {
    console.error(error);
    alert("Kunde inte läsa Excel-filen.");
  }
}

 async function resetTournament() {
  if (!window.confirm("Vill du verkligen radera hela turneringen?"))
    return;

  const tournamentId = "8f0b89db-4db8-4e71-84e4-40cefa96fdf9";

  const { error: matchesError } = await supabase
    .from("matches")
    .delete()
    .eq("tournament_id", tournamentId);

  if (matchesError) {
    console.error(matchesError);
    alert("Kunde inte rensa matcher.");
    return;
  }

  const { error: teamsError } = await supabase
    .from("teams")
    .delete()
    .eq("tournament_id", tournamentId);

  if (teamsError) {
    console.error(teamsError);
    alert("Kunde inte rensa lag.");
    return;
  }

  await loadData();
}


if (viewMode === "spectator") {
  return (
    <>
      <Styles />
      <SpectatorView
        tournament={tournament}
        standingsA={standingsA}
        standingsB={standingsB}
        matches={tournament.matches}
        qualifiers={qualifiers}
        getTeamName={getTeamName}
       onBack={goToAdmin}
      />
    </>
  );
}


if (!isAdmin) {
  return (
    <>
      <Styles />
      <main className="page admin-page">
        <div className="container">
          <section className="hero admin-hero">
            <div>
              <p className="eyebrow">Admin login</p>
              <input
                className="title-input"
                value="Logga in som admin"
                readOnly
              />
              <p className="muted">
                Ange admin-email för att få en login-länk.
              </p>
            </div>

            <div className="button-row">
              <button
                className="btn green"
               onClick={goToSpectator}
              >
                Visa åskådarsida
              </button>
            </div>
          </section>

          <section className="card">
            <div className="form-grid">
             <input
                placeholder="Admin-kod"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
              />

             <button className="btn dark" onClick={login}>
              Logga in
            </button>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
  return (
    <>
      <Styles />
      <main className="page admin-page">
        <div className="container">
          <section className="hero admin-hero">
            <div>
              <p className="eyebrow">Admin</p>
              <input
                className="title-input"
                value={tournament.name}
                onChange={(event) => setTournament((current) => ({ ...current, name: event.target.value }))}
              />
              <p className="muted">10 lag · 2 grupper · 20 gruppspelsmatcher · topp 2 till semifinal</p>
            </div>

            <div className="button-row">
              <button className="btn green" onClick={goToSpectator}>Visa åskådarsida</button>
              <button className="btn dark" onClick={generateGroupMatches}>Skapa 20 gruppmatcher</button>
              <button className="btn danger" onClick={resetTournament}>Rensa allt</button>
              <button className="btn light" onClick={logout}>Logga ut</button>
            </div>
          </section>

          <section className="grid two">
            <div className="card">
              <h2>Lägg till lag</h2>
              <div className="form-grid">
                <input placeholder="Lagnamn" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
                <input placeholder="Logo URL eller base64" value={teamLogo} onChange={(e) => setTeamLogo(e.target.value)} />
                <select value={selectedGroup} onChange={(e) => setSelectedGroup(e.target.value)}>
                  <option value="A">Grupp A</option>
                  <option value="B">Grupp B</option>
                </select>
                <button className="btn dark" onClick={addTeam}>Lägg till</button>
              </div>
            </div>

            <div className="card">
              <h2>Importera Excel</h2>
              <p className="muted small">Excel ska ha kolumner: Lag, Grupp, LogoUrl. Exempel: WOLF CITY, A, https://...</p>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} />
              <p className="muted small">Första gången behöver du köra: npm install xlsx</p>
            </div>
          </section>

          <section className="grid two">
            <TeamEditor title="Grupp A" teams={tournament.groups.A} onChange={(id, field, value) => renameTeam("A", id, field, value)} onRemove={(id) => removeTeam("A", id)} />
            <TeamEditor title="Grupp B" teams={tournament.groups.B} onChange={(id, field, value) => renameTeam("B", id, field, value)} onRemove={(id) => removeTeam("B", id)} />
          </section>

          <section className="card">
            <h2>Skapa match manuellt</h2>
            <div className="match-form">
              <select value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
                <option value="">Välj lag A</option>
                {allTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
              <input type="number" min="0" placeholder="Mål" value={homeGoals} onChange={(e) => setHomeGoals(e.target.value)} />
              <select value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
                <option value="">Välj lag B</option>
                {allTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
              <input type="number" min="0" placeholder="Mål" value={awayGoals} onChange={(e) => setAwayGoals(e.target.value)} />
              <button className="btn dark" onClick={addMatch}>Lägg till match</button>
            </div>
          </section>

          <section className="grid two">
            <Standings title="Tabell Grupp A" rows={standingsA} />
            <Standings title="Tabell Grupp B" rows={standingsB} />
          </section>

          <FinalsCard qualifiers={qualifiers} />

          <section className="card">
            <h2>Matcher</h2>
            <div className="matches-grid">
              {tournament.matches.map((match, index) => (
                <div className="match-card" key={match.id}>
                  <div className="match-number">Match {index + 1}</div>
                  <div className="score-row">
                    <strong>{getTeamName(match.homeTeamId)}</strong>
                    <input type="number" min="0" value={match.homeGoals} onChange={(e) => updateMatch(match.id, "homeGoals", e.target.value)} />
                    <span>-</span>
                    <input type="number" min="0" value={match.awayGoals} onChange={(e) => updateMatch(match.id, "awayGoals", e.target.value)} />
                    <strong>{getTeamName(match.awayTeamId)}</strong>
                  </div>
                  <button className="link-danger" onClick={() => removeMatch(match.id)}>Ta bort</button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function SpectatorView({ tournament, standingsA, standingsB, matches, qualifiers, getTeamName, onBack }) {
  const allRows = [
    ...standingsA.map((row) => ({ ...row, groupName: "Grupp A" })),
    ...standingsB.map((row) => ({ ...row, groupName: "Grupp B" }))
  ];

  return (
    <main className="page spectator-page">
      <div className="container">
        <section className="hero spectator-hero">
          <div>
            <p className="eyebrow">Cupställning</p>
            <h1>{tournament.name}</h1>
            <p>10 lag · Grupp A och Grupp B · topp 2 går till semifinal</p>
          </div>
          <button className="btn light" onClick={onBack}>Till admin</button>
        </section>

        <section className="stats-grid">
          <InfoCard label="Lag" value={allRows.length} />
          <InfoCard label="Matcher" value={`${matches.filter((m) => m.homeGoals !== "" && m.awayGoals !== "").length}/20`} />
          <InfoCard label="Semifinalplatser" value="4" />
        </section>

        <section className="team-logo-grid">
          {allRows.map((team) => (
            <div className="logo-card" key={team.id}>
              <Logo team={team} />
              <div>
                <strong>{team.name}</strong>
                <span>{team.groupName}</span>
              </div>
            </div>
          ))}
        </section>

        <section className="card clean-card">
          <h2>Alla lag</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Lag</th>
                  <th>Grupp</th>
                  <th>SM</th>
                  <th>V</th>
                  <th>O</th>
                  <th>F</th>
                  <th>GM</th>
                  <th>IM</th>
                  <th>MS</th>
                  <th>Poäng</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((row, index) => (
                  <tr key={row.id}>
                    <td>{index + 1}</td>
                    <td className="team-cell"><Logo team={row} /> <strong>{row.name}</strong></td>
                    <td>{row.groupName}</td>
                    <td>{row.played}</td>
                    <td>{row.wins}</td>
                    <td>{row.draws}</td>
                    <td>{row.losses}</td>
                    <td>{row.goalsFor}</td>
                    <td>{row.goalsAgainst}</td>
                    <td>{row.goalDifference}</td>
                    <td className="points">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid two">
          <GroupGrid title="Grupp A" rows={standingsA} />
          <GroupGrid title="Grupp B" rows={standingsB} />
        </section>

        <FinalsCard qualifiers={qualifiers} />

        <section className="card clean-card">
          <h2>Matcher</h2>
          <div className="public-matches-grid">
            {matches.map((match, index) => (
              <div className="public-match" key={match.id}>
                <span>Match {index + 1}</span>
                <div>
                  <strong>{getTeamName(match.homeTeamId)}</strong>
                  <b>{match.homeGoals === "" ? "-" : match.homeGoals} - {match.awayGoals === "" ? "-" : match.awayGoals}</b>
                  <strong>{getTeamName(match.awayTeamId)}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function TeamEditor({ title, teams, onChange, onRemove }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <div className="team-edit-list">
        {teams.map((team) => (
          <div className="team-edit-row" key={team.id}>
            <Logo team={team} />
            <input value={team.name} onChange={(e) => onChange(team.id, "name", e.target.value)} />
            <input placeholder="Logo URL" value={team.logo || ""} onChange={(e) => onChange(team.id, "logo", e.target.value)} />
            <button className="btn danger small-btn" onClick={() => onRemove(team.id)}>Ta bort</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Standings({ title, rows }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lag</th><th>SM</th><th>V</th><th>O</th><th>F</th><th>GM</th><th>IM</th><th>MS</th><th>P</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="team-cell"><Logo team={row} /> <strong>{row.name}</strong></td>
                <td>{row.played}</td><td>{row.wins}</td><td>{row.draws}</td><td>{row.losses}</td>
                <td>{row.goalsFor}</td><td>{row.goalsAgainst}</td><td>{row.goalDifference}</td><td className="points">{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GroupGrid({ title, rows }) {
  return (
    <section className="card clean-card">
      <h2>{title}</h2>
      <div className="group-grid-list">
        {rows.map((row, index) => (
          <div className={`group-row ${index < 2 ? "qualified" : ""}`} key={row.id}>
            <div className="rank">{index + 1}</div>
            <Logo team={row} />
            <div className="grow">
              <strong>{row.name}</strong>
              <span>{row.played} SM · {row.wins} V · {row.draws} O · {row.losses} F · MS {row.goalDifference}</span>
            </div>
            <div className="big-points">{row.points}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalsCard({ qualifiers }) {
  return (
    <section className="card finals-card">
      <h2>Slutspel</h2>
      <p className="muted small">Beräknas automatiskt från tabellen: 1:a och 2:a i varje grupp går till semifinal.</p>
      <div className="finals-grid">
        {qualifiers.semifinals.map((semi) => (
          <div className="semi-card" key={semi.name}>
            <h3>{semi.name}</h3>
            <p>{semi.home?.name ?? "1:a grupp saknas"}</p>
            <strong>vs</strong>
            <p>{semi.away?.name ?? "2:a grupp saknas"}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="info-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Logo({ team }) {
  if (team.logo) {
    return <img className="logo" src={team.logo} alt={team.name} />;
  }

  return <div className="logo logo-placeholder">{team.name?.slice(0, 1).toUpperCase()}</div>;
}

function Styles() {
  return (
    <style>{`
      @media (max-width: 700px) {
  .page {
    padding: 10px;
  }

  .container {
    gap: 14px;
  }

  .hero {
    padding: 18px;
    border-radius: 20px;
  }

  .spectator-hero h1 {
    font-size: 34px;
    line-height: 1.05;
  }

  .spectator-hero p {
    font-size: 15px;
  }

  .stats-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .info-card {
    padding: 14px;
    border-radius: 16px;
  }

  .info-card strong {
    font-size: 28px;
  }

  .team-logo-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .logo-card {
    padding: 12px;
    border-radius: 16px;
  }

  .logo-card strong {
    font-size: 15px;
  }

  .public-matches-grid {
    grid-template-columns: 1fr;
  }

  .public-match {
    padding: 14px;
  }

  .public-match div {
    grid-template-columns: 1fr;
  }

  .card {
    padding: 16px;
    border-radius: 18px;
  }

  table {
    min-width: 760px;
  }
}
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #0f172a; }
      input, select, button { font: inherit; }
      .page { min-height: 100vh; padding: 24px; }
      .admin-page { background: #eef2f7; color: #111827; }
      .spectator-page { background: radial-gradient(circle at top, #1e293b, #020617); color: white; }
      .container { max-width: 1280px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
      .hero { border-radius: 28px; padding: 28px; display: flex; justify-content: space-between; gap: 20px; align-items: center; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.18); }
      .admin-hero { background: white; }
      .spectator-hero { background: linear-gradient(135deg, #111827, #1e293b); border: 1px solid rgba(255,255,255,0.12); }
      .spectator-hero h1 { margin: 4px 0; font-size: clamp(34px, 5vw, 64px); }
      .eyebrow { margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.22em; font-size: 13px; font-weight: 800; color: #10b981; }
      .muted { color: #64748b; margin: 6px 0 0; }
      .spectator-page .muted { color: #cbd5e1; }
      .small { font-size: 14px; }
      .title-input { width: min(100%, 520px); border: 0; border-bottom: 3px solid #e5e7eb; font-size: 34px; font-weight: 900; outline: none; padding: 6px 0; }
      .button-row { display: flex; flex-wrap: wrap; gap: 10px; }
      .btn { border: 0; border-radius: 14px; padding: 12px 16px; font-weight: 800; cursor: pointer; }
      .btn.dark { background: #111827; color: white; }
      .btn.green { background: #059669; color: white; }
      .btn.danger { background: #dc2626; color: white; }
      .btn.light { background: white; color: #111827; }
      .small-btn { padding: 8px 10px; border-radius: 10px; }
      .grid { display: grid; gap: 24px; }
      .two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card { background: white; color: #111827; border-radius: 24px; padding: 22px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12); }
      .clean-card { background: rgba(255,255,255,0.96); }
      .card h2 { margin: 0 0 16px; font-size: 26px; }
      .form-grid { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 10px; }
      .form-grid input, .form-grid select, .match-form input, .match-form select, .team-edit-row input { border: 1px solid #cbd5e1; border-radius: 12px; padding: 11px 12px; min-width: 0; }
      .match-form { display: grid; grid-template-columns: 1fr 90px 1fr 90px auto; gap: 10px; }
      .team-edit-list { display: flex; flex-direction: column; gap: 10px; }
      .team-edit-row { display: grid; grid-template-columns: auto 1fr 1fr auto; gap: 10px; align-items: center; }
      .logo { width: 52px; height: 52px; border-radius: 12px; object-fit: cover; background: #e2e8f0; flex: 0 0 auto; }
      .logo-placeholder { display: flex; align-items: center; justify-content: center; font-weight: 900; color: #111827; }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; min-width: 860px; }
      th { background: #f1f5f9; color: #475569; text-align: left; padding: 14px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; }
      td { padding: 14px; border-bottom: 1px solid #e5e7eb; }
      .team-cell { display: flex; align-items: center; gap: 12px; }
      .team-cell .logo { width: 38px; height: 38px; border-radius: 10px; }
      .points { font-size: 22px; font-weight: 900; }
      .matches-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .match-card { border: 1px solid #e5e7eb; border-radius: 18px; padding: 14px; background: #f8fafc; }
      .match-number { color: #64748b; font-weight: 800; font-size: 13px; margin-bottom: 8px; }
      .score-row { display: grid; grid-template-columns: 1fr 70px auto 70px 1fr; align-items: center; gap: 10px; }
      .score-row input { border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px; width: 70px; text-align: center; }
      .link-danger { border: 0; background: transparent; color: #dc2626; font-weight: 800; cursor: pointer; margin-top: 10px; }
      .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
      .info-card { background: white; color: #111827; border-radius: 22px; padding: 22px; box-shadow: 0 18px 40px rgba(0,0,0,0.2); }
      .info-card span { display: block; color: #64748b; text-transform: uppercase; font-size: 13px; font-weight: 900; letter-spacing: .08em; }
      .info-card strong { display: block; margin-top: 6px; font-size: 42px; }
      .team-logo-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; }
      .logo-card { background: rgba(255,255,255,0.94); color: #111827; border-radius: 22px; padding: 16px; display: flex; gap: 12px; align-items: center; box-shadow: 0 16px 40px rgba(0,0,0,.18); }
      .logo-card strong { display: block; font-size: 18px; }
      .logo-card span { display: block; color: #64748b; margin-top: 4px; font-weight: 700; }
      .group-grid-list { display: grid; gap: 12px; }
      .group-row { display: grid; grid-template-columns: auto auto 1fr auto; gap: 12px; align-items: center; background: #f1f5f9; border-radius: 18px; padding: 14px; border: 2px solid transparent; }
      .group-row.qualified { border-color: #10b981; background: #ecfdf5; }
      .rank { width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; border-radius: 999px; background: #111827; color: white; font-weight: 900; }
      .grow strong { display: block; font-size: 18px; }
      .grow span { color: #64748b; font-size: 14px; }
      .big-points { font-size: 32px; font-weight: 900; }
      .finals-card { background: linear-gradient(135deg, #ffffff, #ecfdf5); }
      .finals-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      .semi-card { background: white; border: 1px solid #d1fae5; border-radius: 20px; padding: 18px; text-align: center; }
      .semi-card h3 { margin: 0 0 12px; }
      .semi-card p { font-size: 22px; font-weight: 900; margin: 8px 0; }
      .semi-card strong { color: #059669; }
      .public-matches-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
      .public-match { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 18px; padding: 14px; }
      .public-match span { display: block; color: #64748b; font-weight: 800; font-size: 12px; margin-bottom: 8px; }
      .public-match div { display: grid; gap: 6px; text-align: center; }
      .public-match b { background: #111827; color: white; padding: 8px 10px; border-radius: 12px; font-size: 20px; }
      @media (max-width: 950px) {
        .two, .stats-grid, .team-logo-grid, .matches-grid, .public-matches-grid, .finals-grid { grid-template-columns: 1fr; }
        .hero { flex-direction: column; align-items: flex-start; }
        .form-grid, .match-form, .team-edit-row, .score-row { grid-template-columns: 1fr; }
        .score-row input { width: 100%; }
      }
    `}</style>
  );
}
