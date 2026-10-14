use mlua::{Function, Lua, Result, Table, Value};
fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let lua = Lua::new();
    let g = lua.globals();
    // __load(source, chunkName, envTable) -> function
    g.set("__load", lua.create_function(|lua, (src, name, env): (String, String, Table)| {
        let f: Function = lua.load(&src).set_name(name).set_environment(env).into_function()?;
        Ok(f)
    })?)?;
    g.set("__readfile", lua.create_function(|_, path: String| {
        Ok(std::fs::read_to_string(&path).map_err(mlua::Error::external)?)
    })?)?;
    // compile-check mode: luaurun file1 file2 ... [--run script]
    let mut i = 1;
    let mut ok = true;
    while i < args.len() && args[i] != "--run" {
        let src = std::fs::read_to_string(&args[i]).unwrap();
        match lua.load(&src).set_name(args[i].as_str()).into_function() {
            Ok(_) => println!("compiled ok: {}", args[i]),
            Err(e) => { println!("COMPILE ERROR {}: {}", args[i], e); ok = false; }
        }
        i += 1;
    }
    if i + 1 < args.len() {
        let src = std::fs::read_to_string(&args[i + 1]).unwrap();
        if let Err(e) = lua.load(&src).set_name("harness").exec() {
            println!("HARNESS ERROR: {}", e);
            std::process::exit(2);
        }
    }
    let _ = Value::Nil;
    if !ok { std::process::exit(1); }
    Ok(())
}
