create table producto (
	ean char(13) primary key,
	nombre varchar(500) not null,
    gramos float,
    descripcion varchar(1000),
    marca int);
    
create table marca (
	id int primary key auto_increment,
    nombre varchar(100) not null);
    
create table categoria (
	id int primary key auto_increment,
    nombre varchar(100) not null);
    
create table proveedor (
	id int primary key auto_increment,
    nombre varchar(100) not null,
    cuit varchar(14),
    ubicacion varchar(100),
    telefono varchar(15)
);

create table precios (
	precio float not null,
    proveedor int,
    producto char(13),
    fecha date not null,
    
    foreign key (proveedor) references proveedor(id),
    foreign key (producto) references producto(ean)
);
    
alter table producto add foreign key (marca) references marca (id);
alter table producto add column categoriaId int not null;
alter table producto add foreign key (categoriaId) references categoria(id);
alter table producto add column stock int default 0;
alter table producto add column precio_venta int;

create table if not exists ventas (
	id int auto_increment primary key,
    fecha datetime not null,
    total decimal(10,2) not null
);

create table if not exists detalle_venta (
	id int auto_increment primary key,
    venta_id int not null,
    producto char(13) not null,
    cantidad int not null,
    precio_unitario decimal(10, 2) not null,
    foreign key (venta_id) references ventas(id),
    foreign key (producto) references producto(ean)
);

ALTER TABLE detalle_venta ADD COLUMN compra_id INT NULL,
ADD FOREIGN KEY (compra_id) REFERENCES compras(id);

CREATE TABLE IF NOT EXISTS compras (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha DATETIME NOT NULL,
    proveedor INT NOT NULL,
    producto CHAR(13) NOT NULL,
    cantidad INT NOT NULL,
    precio_compra DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (proveedor) REFERENCES proveedor(id),
    FOREIGN KEY (producto) REFERENCES producto(ean)
);

insert into proveedor(nombre, ubicacion) values ("La anónima", "Chivilcoy");

select * from categoria;
select * from marca;
select * from producto;
select * from proveedor;
select * from precios;
select * from ventas;
select * from detalle_venta;
select * from compras;

delete from compras where id = 17;

delete from producto where ean = "7891000405291";

SHOW VARIABLES LIKE 'datadir';