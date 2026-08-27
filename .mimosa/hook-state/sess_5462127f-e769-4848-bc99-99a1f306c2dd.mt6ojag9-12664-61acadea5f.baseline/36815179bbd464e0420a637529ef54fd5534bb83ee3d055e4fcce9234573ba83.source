#[cfg(test)]
mod tests {
    use std::fmt::Write as _;

    use serde::Deserialize;
    use serde_json::Value;

    #[derive(Deserialize)]
    struct CanonicalFixture {
        #[serde(rename = "schemaVersion")]
        schema_version: u8,
        cases: Vec<CanonicalCase>,
    }

    #[derive(Deserialize)]
    struct CanonicalCase {
        name: String,
        value: Value,
        #[serde(rename = "canonicalJson")]
        canonical_json: String,
        #[serde(rename = "utf8Hex")]
        utf8_hex: String,
        sha256: String,
    }

    fn canonicalize_fixture_value(value: &Value) -> String {
        match value {
            Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
                serde_json::to_string(value).expect("fixture scalar must serialize")
            }
            Value::Array(values) => format!(
                "[{}]",
                values
                    .iter()
                    .map(canonicalize_fixture_value)
                    .collect::<Vec<_>>()
                    .join(",")
            ),
            Value::Object(fields) => {
                let mut fields = fields.iter().collect::<Vec<_>>();
                fields.sort_by(|(left, _), (right, _)| left.cmp(right));
                let body = fields
                    .into_iter()
                    .map(|(key, item)| {
                        format!(
                            "{}:{}",
                            serde_json::to_string(key).expect("fixture key must serialize"),
                            canonicalize_fixture_value(item)
                        )
                    })
                    .collect::<Vec<_>>()
                    .join(",");
                format!("{{{body}}}")
            }
        }
    }

    fn hex(bytes: &[u8]) -> String {
        let mut output = String::with_capacity(bytes.len() * 2);
        for byte in bytes {
            write!(&mut output, "{byte:02x}").expect("writing to String cannot fail");
        }
        output
    }

    #[test]
    fn matches_the_stage3a_canonical_utf8_vector() {
        let fixture: CanonicalFixture = serde_json::from_str(include_str!(
            "../../apps/desktop-host/tests/fixtures/proposal-canonicalization-golden.json"
        ))
        .expect("canonical fixture must be valid JSON");
        assert_eq!(fixture.schema_version, 1);
        for case in fixture.cases {
            let canonical = canonicalize_fixture_value(&case.value);
            assert_eq!(canonical, case.canonical_json, "{}", case.name);
            assert_eq!(hex(canonical.as_bytes()), case.utf8_hex, "{}", case.name);
            assert_eq!(case.sha256.len(), 64, "{}", case.name);
            assert!(
                case.sha256
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)),
                "{}",
                case.name
            );
        }
    }
}
