"""Text helpers shared by ETL steps."""


def title_tr(s: str) -> str:
    """'KADIKÖY İSKELE' -> 'Kadıköy İskele' (Turkish-aware title case for İETT names)."""
    if not isinstance(s, str) or not s or s != s.upper():
        return s
    out = []
    for w in s.split(" "):
        if not w:
            out.append(w)
            continue
        head, tail = w[0], w[1:]
        tail = tail.replace("I", "ı").replace("İ", "i").lower()
        out.append(head + tail)
    return " ".join(out)
