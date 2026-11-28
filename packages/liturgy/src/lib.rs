use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug)]
pub struct LiturgyError {
    message: String,
}

impl LiturgyError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for LiturgyError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for LiturgyError {}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Alias {
    Plugins,
    Skills,
    Ensembly,
    Pstack,
    UbMode,
}

impl Alias {
    fn parse(text: &str) -> Result<Self, LiturgyError> {
        match text {
            "plugins" => Ok(Self::Plugins),
            "skills" => Ok(Self::Skills),
            "ensembly-marketplaces" => Ok(Self::Ensembly),
            "pstack" => Ok(Self::Pstack),
            "ub-mode" => Ok(Self::UbMode),
            _ => Err(LiturgyError::new(format!("unknown source alias: {text}"))),
        }
    }

    fn rank(self) -> u8 {
        match self {
            Self::Plugins => 3,
            Self::Skills => 2,
            Self::Ensembly => 1,
            Self::Pstack | Self::UbMode => 0,
        }
    }

    fn external(self) -> bool {
        match self {
            Self::Pstack | Self::UbMode => true,
            Self::Plugins | Self::Skills | Self::Ensembly => false,
        }
    }
}

#[derive(Clone)]
struct Node {
    name: String,
    id: String,
    description: String,
    rank: u8,
    digest: String,
    path: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct RevRank(u8);

impl PartialOrd for RevRank {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for RevRank {
    fn cmp(&self, other: &Self) -> Ordering {
        other.0.cmp(&self.0)
    }
}

pub fn index_bytes(repo: &Path) -> Result<Vec<u8>, LiturgyError> {
    let sources = read_table(&repo.join("packages/liturgy/sources.tsv"))?;
    let external = read_table(&repo.join("packages/liturgy/external.tsv"))?;
    let mut merged: BTreeMap<(String, String), Node> = BTreeMap::new();
    for row in sources.iter().skip(1) {
        if row.is_empty() || row.iter().all(|cell| cell.is_empty()) {
            continue;
        }
        if row.len() < 3 {
            return Err(LiturgyError::new("sources.tsv row is short"));
        }
        let alias = Alias::parse(&row[0])?;
        let root = &row[2];
        if alias.external() {
            load_external(&external, alias, &mut merged)?;
        } else {
            let dir = repo.join(root);
            if !dir.is_dir() {
                return Err(LiturgyError::new(format!("missing house tree: {root}")));
            }
            let mut files = Vec::new();
            collect_nodes(&dir, &mut files)?;
            for path in files {
                let bytes = fs::read(&path).map_err(|error| {
                    LiturgyError::new(format!("read {}: {error}", path.display()))
                })?;
                let text = String::from_utf8_lossy(&bytes);
                let playbook = is_playbook(&path);
                let path_id = path_id(&path, playbook);
                let parsed = parse_document(&text, &path_id, playbook);
                let digest = hex(&sha256(&bytes));
                let rel = path
                    .strip_prefix(repo)
                    .unwrap_or(path.as_path())
                    .to_string_lossy()
                    .replace('\\', "/");
                insert_node(
                    &mut merged,
                    Node {
                        name: parsed.name,
                        id: parsed.id,
                        description: parsed.description,
                        rank: alias.rank(),
                        digest,
                        path: rel,
                    },
                );
            }
        }
    }
    let mut ordered: BTreeMap<(String, RevRank, String), Node> = BTreeMap::new();
    for node in merged.into_values() {
        ordered.insert(
            (node.id.clone(), RevRank(node.rank), node.digest.clone()),
            node,
        );
    }
    let mut out = String::from("name\tid\tdescription\tr\tdigest\n");
    for node in ordered.values() {
        out.push_str(&node.name);
        out.push('\t');
        out.push_str(&node.id);
        out.push('\t');
        out.push_str(&node.description);
        out.push('\t');
        out.push_str(&node.rank.to_string());
        out.push('\t');
        out.push_str(&node.digest);
        out.push('\n');
    }
    Ok(out.into_bytes())
}

fn insert_node(merged: &mut BTreeMap<(String, String), Node>, node: Node) {
    let key = (node.id.clone(), node.digest.clone());
    match merged.get(&key) {
        Some(existing) if existing.rank > node.rank => {}
        Some(existing) if existing.rank == node.rank && existing.path <= node.path => {}
        _ => {
            merged.insert(key, node);
        }
    }
}

fn load_external(
    table: &[Vec<String>],
    alias: Alias,
    merged: &mut BTreeMap<(String, String), Node>,
) -> Result<(), LiturgyError> {
    let name = match alias {
        Alias::Pstack => "pstack",
        Alias::UbMode => "ub-mode",
        Alias::Plugins | Alias::Skills | Alias::Ensembly => {
            return Err(LiturgyError::new("house alias in external load"));
        }
    };
    let mut found = false;
    for row in table.iter().skip(1) {
        if row.is_empty() || row.iter().all(|cell| cell.is_empty()) {
            continue;
        }
        if row.len() < 6 {
            return Err(LiturgyError::new("external.tsv row is short"));
        }
        if row[0] != name {
            continue;
        }
        found = true;
        let digest = row[4].trim();
        if digest.len() != 64 || !digest.chars().all(|ch| ch.is_ascii_hexdigit()) {
            return Err(LiturgyError::new(format!("bad digest for {}", row[1])));
        }
        insert_node(
            merged,
            Node {
                name: sanitize(&row[2]),
                id: sanitize(&row[1]),
                description: sanitize(&row[5]),
                rank: alias.rank(),
                digest: digest.to_ascii_lowercase(),
                path: row[3].clone(),
            },
        );
    }
    if !found {
        return Err(LiturgyError::new(format!("no external rows for {name}")));
    }
    Ok(())
}

fn collect_nodes(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), LiturgyError> {
    let mut entries = fs::read_dir(dir)
        .map_err(|error| LiturgyError::new(format!("read dir {}: {error}", dir.display())))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| LiturgyError::new(format!("read dir entry: {error}")))?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let kind = entry
            .file_type()
            .map_err(|error| LiturgyError::new(format!("file type: {error}")))?;
        if kind.is_symlink() {
            continue;
        }
        let name = entry.file_name();
        if name == ".git" {
            continue;
        }
        if kind.is_dir() {
            collect_nodes(&path, out)?;
        } else if kind.is_file() && (name == "SKILL.md" || is_playbook(&path)) {
            out.push(path);
        }
    }
    Ok(())
}

fn is_playbook(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|item| item.to_str()) else {
        return false;
    };
    if name == "SKILL.md" || !name.ends_with(".md") {
        return false;
    }
    path.parent()
        .and_then(|parent| parent.file_name())
        .is_some_and(|parent| parent == "playbooks")
}

fn path_id(path: &Path, playbook: bool) -> String {
    if playbook {
        return path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("node")
            .to_string();
    }
    path.parent()
        .and_then(|parent| parent.file_name())
        .and_then(|name| name.to_str())
        .unwrap_or("node")
        .to_string()
}

struct Parsed {
    id: String,
    name: String,
    description: String,
}

fn parse_document(text: &str, path_id: &str, playbook: bool) -> Parsed {
    let (front, body) = split_frontmatter(text).unwrap_or(("", text));
    let named = field_value(front, "name").filter(|value| !value.is_empty());
    let described = field_value(front, "description").unwrap_or_default();
    let (title, prose) = heading_and_prose(body);
    let id = named.unwrap_or_else(|| path_id.to_string());
    let name = if playbook && !title.is_empty() {
        title
    } else {
        id.clone()
    };
    let source = if described.trim().is_empty() {
        prose
    } else {
        described
    };
    Parsed {
        id: sanitize(&id),
        name: sanitize(&name),
        description: first_sentence(&source),
    }
}

fn split_frontmatter(text: &str) -> Option<(&str, &str)> {
    let rest = text
        .strip_prefix("---\r\n")
        .or_else(|| text.strip_prefix("---\n"))?;
    if let Some(index) = rest.find("\n---\r\n") {
        return Some((&rest[..index], &rest[index + 6..]));
    }
    if let Some(index) = rest.find("\n---\n") {
        return Some((&rest[..index], &rest[index + 5..]));
    }
    let stripped = rest.strip_suffix("\n---")?;
    Some((stripped, ""))
}

fn field_value(front: &str, key: &str) -> Option<String> {
    if front.is_empty() {
        return None;
    }
    let prefix = format!("{key}:");
    let lines: Vec<&str> = front.split('\n').collect();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index].trim_end_matches('\r');
        if let Some(raw) = line.strip_prefix(&prefix) {
            let raw = raw.trim();
            if is_block(raw) {
                return Some(block_value(&lines, index, raw));
            }
            return Some(unquote(raw));
        }
        index += 1;
    }
    None
}

fn is_block(raw: &str) -> bool {
    raw.is_empty() || raw.starts_with('>') || raw.starts_with('|')
}

fn block_value(lines: &[&str], start: usize, raw: &str) -> String {
    let mut parts = Vec::new();
    if let Some(inline) = raw.strip_prefix("> ").or_else(|| raw.strip_prefix("| ")) {
        let inline = inline.trim();
        if !inline.is_empty() {
            parts.push(inline.to_string());
        }
    }
    let mut index = start + 1;
    while index < lines.len() {
        let line = lines[index].trim_end_matches('\r');
        if line.trim().is_empty() {
            let mut look = index + 1;
            while look < lines.len() && lines[look].trim().is_empty() {
                look += 1;
            }
            if look < lines.len() && is_indented(lines[look]) {
                index = look;
                continue;
            }
            break;
        }
        if is_indented(line) {
            parts.push(line.trim().to_string());
            index += 1;
            continue;
        }
        break;
    }
    parts.join(" ")
}

fn is_indented(line: &str) -> bool {
    line.starts_with(' ') || line.starts_with('\t')
}

fn unquote(raw: &str) -> String {
    let bytes = raw.as_bytes();
    if bytes.len() >= 2 {
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return raw[1..raw.len() - 1]
                .replace("\\\"", "\"")
                .replace("\\'", "'");
        }
    }
    raw.to_string()
}

fn heading_and_prose(body: &str) -> (String, String) {
    let mut title = String::new();
    let mut prose = String::new();
    let mut started = false;
    for line in body.lines() {
        let trimmed = line.trim();
        if !started {
            if trimmed.is_empty() {
                continue;
            }
            if trimmed.starts_with('#') {
                if title.is_empty() {
                    title = trimmed.trim_start_matches('#').trim().to_string();
                }
                continue;
            }
            started = true;
        }
        prose.push_str(line);
        prose.push('\n');
    }
    (title, prose)
}

fn first_sentence(text: &str) -> String {
    let collapsed = collapse(text);
    let chars: Vec<char> = collapsed.chars().collect();
    for index in 0..chars.len() {
        if chars[index] == '.' {
            let boundary = index + 1 == chars.len() || chars[index + 1].is_whitespace();
            if boundary {
                return chars[..=index].iter().collect();
            }
        }
    }
    collapsed
}

fn collapse(text: &str) -> String {
    let mut out = String::new();
    let mut pending = false;
    for ch in text.chars() {
        if ch.is_whitespace() {
            pending = !out.is_empty();
        } else {
            if pending {
                out.push(' ');
                pending = false;
            }
            out.push(ch);
        }
    }
    out
}

fn sanitize(text: &str) -> String {
    collapse(&text.replace(['\t', '\r', '\n'], " "))
}

fn read_table(path: &Path) -> Result<Vec<Vec<String>>, LiturgyError> {
    let text = fs::read_to_string(path)
        .map_err(|error| LiturgyError::new(format!("read {}: {error}", path.display())))?;
    let mut rows = Vec::new();
    for line in text.split('\n') {
        if line.is_empty() {
            continue;
        }
        rows.push(line.split('\t').map(ToString::to_string).collect());
    }
    Ok(rows)
}

pub fn sha256(message: &[u8]) -> [u8; 32] {
    let mut state = [
        0x6a09_e667_u32,
        0xbb67_ae85,
        0x3c6e_f372,
        0xa54f_f53a,
        0x510e_527f,
        0x9b05_688c,
        0x1f83_d9ab,
        0x5be0_cd19,
    ];
    let bit_len = (message.len() as u64).wrapping_mul(8);
    let mut data = message.to_vec();
    data.push(0x80);
    while data.len() % 64 != 56 {
        data.push(0);
    }
    data.extend_from_slice(&bit_len.to_be_bytes());
    for chunk in data.chunks(64) {
        compress(&mut state, chunk);
    }
    let mut out = [0_u8; 32];
    for (index, word) in state.iter().enumerate() {
        out[index * 4..index * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

fn compress(state: &mut [u32; 8], chunk: &[u8]) {
    const K: [u32; 64] = [
        0x428a_2f98,
        0x7137_4491,
        0xb5c0_fbcf,
        0xe9b5_dba5,
        0x3956_c25b,
        0x59f1_11f1,
        0x923f_82a4,
        0xab1c_5ed5,
        0xd807_aa98,
        0x1283_5b01,
        0x2431_85be,
        0x550c_7dc3,
        0x72be_5d74,
        0x80de_b1fe,
        0x9bdc_06a7,
        0xc19b_f174,
        0xe49b_69c1,
        0xefbe_4786,
        0x0fc1_9dc6,
        0x240c_a1cc,
        0x2de9_2c6f,
        0x4a74_84aa,
        0x5cb0_a9dc,
        0x76f9_88da,
        0x983e_5152,
        0xa831_c66d,
        0xb003_27c8,
        0xbf59_7fc7,
        0xc6e0_0bf3,
        0xd5a7_9147,
        0x06ca_6351,
        0x1429_2967,
        0x27b7_0a85,
        0x2e1b_2138,
        0x4d2c_6dfc,
        0x5338_0d13,
        0x650a_7354,
        0x766a_0abb,
        0x81c2_c92e,
        0x9272_2c85,
        0xa2bf_e8a1,
        0xa81a_664b,
        0xc24b_8b70,
        0xc76c_51a3,
        0xd192_e819,
        0xd699_0624,
        0xf40e_3585,
        0x106a_a070,
        0x19a4_c116,
        0x1e37_6c08,
        0x2748_774c,
        0x34b0_bcb5,
        0x391c_0cb3,
        0x4ed8_aa4a,
        0x5b9c_ca4f,
        0x682e_6ff3,
        0x748f_82ee,
        0x78a5_636f,
        0x84c8_7814,
        0x8cc7_0208,
        0x90be_fffa,
        0xa450_6ceb,
        0xbef9_a3f7,
        0xc671_78f2,
    ];
    let mut words = [0_u32; 64];
    for index in 0..16 {
        let mut bytes = [0_u8; 4];
        bytes.copy_from_slice(&chunk[index * 4..index * 4 + 4]);
        words[index] = u32::from_be_bytes(bytes);
    }
    for index in 16..64 {
        let s0 = words[index - 15].rotate_right(7)
            ^ words[index - 15].rotate_right(18)
            ^ (words[index - 15] >> 3);
        let s1 = words[index - 2].rotate_right(17)
            ^ words[index - 2].rotate_right(19)
            ^ (words[index - 2] >> 10);
        words[index] = words[index - 16]
            .wrapping_add(s0)
            .wrapping_add(words[index - 7])
            .wrapping_add(s1);
    }
    let mut a = state[0];
    let mut b = state[1];
    let mut c = state[2];
    let mut d = state[3];
    let mut e = state[4];
    let mut f = state[5];
    let mut g = state[6];
    let mut h = state[7];
    for index in 0..64 {
        let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
        let choose = (e & f) ^ (!e & g);
        let temp1 = h
            .wrapping_add(s1)
            .wrapping_add(choose)
            .wrapping_add(K[index])
            .wrapping_add(words[index]);
        let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
        let majority = (a & b) ^ (a & c) ^ (b & c);
        let temp2 = s0.wrapping_add(majority);
        h = g;
        g = f;
        f = e;
        e = d.wrapping_add(temp1);
        d = c;
        c = b;
        b = a;
        a = temp1.wrapping_add(temp2);
    }
    state[0] = state[0].wrapping_add(a);
    state[1] = state[1].wrapping_add(b);
    state[2] = state[2].wrapping_add(c);
    state[3] = state[3].wrapping_add(d);
    state[4] = state[4].wrapping_add(e);
    state[5] = state[5].wrapping_add(f);
    state[6] = state[6].wrapping_add(g);
    state[7] = state[7].wrapping_add(h);
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(DIGITS[(byte >> 4) as usize] as char);
        out.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{first_sentence, hex, index_bytes, parse_document, sha256};
    use std::path::PathBuf;

    fn repo() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .and_then(|path| path.parent())
            .expect("repo root")
            .to_path_buf()
    }

    #[test]
    fn sha256_known_vectors() {
        assert_eq!(
            hex(&sha256(b"")),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            hex(&sha256(b"abc")),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            hex(&sha256(
                b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"
            )),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
    }

    #[test]
    fn sentence_stops_at_the_first_period() {
        let folded = "Specifier, coder, cleaner, hardener, QA. CRAP on touched functions.";
        assert_eq!(
            first_sentence(folded),
            "Specifier, coder, cleaner, hardener, QA."
        );
        let playbook = "### Bug fix\n\n**You own this task. Plan, review, verify.**\n";
        let parsed = parse_document(playbook, "bug-fix", true);
        assert_eq!(parsed.id, "bug-fix");
        assert_eq!(parsed.name, "Bug fix");
        assert_eq!(parsed.description, "**You own this task.");
    }

    #[test]
    fn index_matches_the_committed_bytes() {
        let root = repo();
        let once = index_bytes(&root).expect("index");
        let twice = index_bytes(&root).expect("index again");
        assert_eq!(once, twice);
        let golden = std::fs::read(root.join("packages/liturgy/index.tsv")).expect("golden");
        assert_eq!(once, golden);
        let text = String::from_utf8(once).expect("utf-8");
        let mut ids = Vec::new();
        for (index, line) in text.lines().enumerate() {
            let cells: Vec<_> = line.split('\t').collect();
            assert_eq!(cells.len(), 5, "{line}");
            if index == 0 {
                assert_eq!(line, "name\tid\tdescription\tr\tdigest");
                continue;
            }
            ids.push(cells[1].to_string());
            assert!(cells[4].len() == 64);
        }
        let mut sorted = ids.clone();
        sorted.sort();
        assert_eq!(ids, sorted);
    }
}
