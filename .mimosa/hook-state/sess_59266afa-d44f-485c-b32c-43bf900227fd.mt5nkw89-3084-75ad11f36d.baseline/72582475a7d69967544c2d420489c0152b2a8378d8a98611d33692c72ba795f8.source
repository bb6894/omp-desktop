use std::io::{ErrorKind, Read};

use serde_json::Value;

pub(crate) const MAX_LOCAL_FRAME_BYTES: usize = 16 * 1024 * 1024;

pub(crate) fn encode_local_frame(value: &Value) -> Result<Vec<u8>, String> {
    let payload =
        serde_json::to_vec(value).map_err(|_| "host request is not serializable".to_string())?;
    if payload.is_empty() || payload.len() > MAX_LOCAL_FRAME_BYTES {
        return Err("HOST_FRAME_SIZE_INVALID".to_string());
    }
    let mut output = Vec::with_capacity(4 + payload.len());
    output.extend_from_slice(&(payload.len() as u32).to_le_bytes());
    output.extend_from_slice(&payload);
    Ok(output)
}

pub(crate) fn read_local_frame<R: Read>(reader: &mut R) -> Result<Option<Value>, String> {
    let mut header = [0_u8; 4];
    let mut read = 0;
    while read < header.len() {
        match reader.read(&mut header[read..]) {
            Ok(0) if read == 0 => return Ok(None),
            Ok(0) => return Err("HOST_FRAME_TRUNCATED".to_string()),
            Ok(count) => read += count,
            Err(error) if error.kind() == ErrorKind::Interrupted => continue,
            Err(error) => return Err(format!("host stdout read failed: {error}")),
        }
    }
    let length = u32::from_le_bytes(header) as usize;
    if length == 0 || length > MAX_LOCAL_FRAME_BYTES {
        return Err("HOST_FRAME_SIZE_INVALID".to_string());
    }
    let mut payload = vec![0_u8; length];
    reader
        .read_exact(&mut payload)
        .map_err(|_| "HOST_FRAME_TRUNCATED".to_string())?;
    serde_json::from_slice(&payload)
        .map(Some)
        .map_err(|_| "HOST_FRAME_NOT_JSON".to_string())
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use serde::Deserialize;
    use serde_json::Value;

    use super::{encode_local_frame, read_local_frame};

    #[derive(Deserialize)]
    struct GoldenFixture {
        #[serde(rename = "schemaVersion")]
        schema_version: u8,
        cases: Vec<GoldenCase>,
    }

    #[derive(Deserialize)]
    struct GoldenCase {
        name: String,
        value: Value,
        #[serde(rename = "frameHex")]
        frame_hex: String,
    }

    fn decode_hex(value: &str) -> Vec<u8> {
        assert_eq!(value.len() % 2, 0);
        value
            .as_bytes()
            .chunks_exact(2)
            .map(|chunk| {
                let pair = std::str::from_utf8(chunk).expect("fixture hex must be UTF-8");
                u8::from_str_radix(pair, 16).expect("fixture hex must be valid")
            })
            .collect()
    }

    #[test]
    fn matches_shared_request_success_and_error_vectors() {
        let fixture: GoldenFixture = serde_json::from_str(include_str!(
            "../../apps/desktop-host/tests/fixtures/local-protocol-golden.json"
        ))
        .expect("golden fixture must be valid JSON");
        assert_eq!(fixture.schema_version, 1);
        for case in fixture.cases {
            let expected = decode_hex(&case.frame_hex);
            assert_eq!(encode_local_frame(&case.value).expect(&case.name), expected);
            let decoded = read_local_frame(&mut Cursor::new(expected))
                .expect(&case.name)
                .expect("golden frame must contain one value");
            assert_eq!(decoded, case.value, "{}", case.name);
        }
    }
}
